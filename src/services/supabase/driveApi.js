// driveApi.js
//
// 학원 공유 드라이브 API. 실제 파일은 비공개 Storage 버킷(academy-drive)에,
// 파일명/다운로드 정책은 academy_drive_files 테이블에 분리 저장한다.
//
// 일반 직원에게 Storage object 직접 select 권한을 주지 않는다. 열람·인쇄·다운로드
// URL은 Edge Function이 현재 멤버십과 파일 정책을 확인한 뒤 짧은 시간만 발급한다.

import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export const ACADEMY_DRIVE_BUCKET = 'academy-drive';
export const MAX_DRIVE_FILE_SIZE = 50 * 1024 * 1024;
export const DEFAULT_ACADEMY_DRIVE_QUOTA = 1024 * 1024 * 1024;
const ALLOWED_DRIVE_EXTENSIONS = new Set([
  'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'odt', 'rtf',
  'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'md',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp',
]);

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('공유 드라이브를 사용하려면 Supabase 연결이 필요해요.');
  }
}

async function getCurrentUserOrThrow() {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error('로그인이 필요해요.');
  return data.user;
}

async function readDriveFunctionError(error, fallback) {
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        return payload.error.trim();
      }
    } catch {
      // Edge Function이 JSON이 아닌 응답을 반환한 경우 아래 상태별 문구를 쓴다.
    }
  }

  if (response?.status === 401) {
    return '로그인 정보가 만료됐어요. 다시 로그인해주세요.';
  }
  if (response?.status === 403) {
    return '이 자료를 처리할 권한이 없어요.';
  }
  if (response?.status === 404) {
    return '자료를 찾을 수 없어요. 목록을 새로고침해주세요.';
  }
  if (response?.status >= 500) {
    return '파일 서버에서 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
  }
  return fallback;
}

async function getDriveAccessToken({ refresh = false } = {}) {
  const result = refresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();
  if (result.error) throw result.error;

  let session = result.data?.session || null;
  const expiresAt = Number(session?.expires_at) || 0;
  if (!refresh && session?.refresh_token && expiresAt * 1000 <= Date.now() + 30_000) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    session = refreshed.data?.session || null;
  }
  if (!session?.access_token) {
    throw new Error('로그인 정보가 만료됐어요. 다시 로그인해주세요.');
  }
  return session.access_token;
}

// FunctionsClient의 내부 세션 갱신 시점에 의존하지 않고 현재 access token을
// 명시적으로 보낸다. 모바일 절전 복귀 등의 오래된 토큰은 401에서 한 번 갱신한다.
async function invokeAcademyDriveFile(body) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const accessToken = await getDriveAccessToken({ refresh: attempt > 0 });
    const { data, error } = await supabase.functions.invoke('academy-drive-file', {
      body,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!error) return data;

    const status = Number(error?.context?.status) || 0;
    if (status === 401 && attempt === 0) continue;
    throw new Error(await readDriveFunctionError(
      error,
      '파일 요청을 처리하지 못했어요.',
    ));
  }
  throw new Error('로그인 정보가 만료됐어요. 다시 로그인해주세요.');
}

function extensionFrom(name = '') {
  const match = String(name).match(/\.([a-z0-9]{1,12})$/i);
  return match ? `.${match[1].toLowerCase()}` : '';
}

function createStoragePath(academyId, file) {
  const id = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${academyId}/${id}${extensionFrom(file?.name)}`;
}

export async function listAcademyDriveFiles(academyId, { includeDeleted = false } = {}) {
  assertSupabaseConfigured();
  if (!academyId) return [];
  let query = supabase
    .from('academy_drive_files')
    .select('*')
    .eq('academy_id', academyId)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (!includeDeleted) query = query.is('deleted_at', null);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listAcademyDriveFolders(academyId, { includeDeleted = false } = {}) {
  assertSupabaseConfigured();
  if (!academyId) return [];
  let query = supabase
    .from('academy_drive_folders')
    .select('*')
    .eq('academy_id', academyId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (!includeDeleted) query = query.is('deleted_at', null);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getAcademyDriveUsage(academyId) {
  assertSupabaseConfigured();
  if (!academyId) {
    return { usedBytes: 0, quotaBytes: DEFAULT_ACADEMY_DRIVE_QUOTA };
  }
  const { data, error } = await supabase
    .rpc('get_academy_drive_usage', { p_academy_id: academyId })
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('드라이브 사용량을 확인할 권한이 없어요.');
  return {
    usedBytes: Number(data.used_bytes) || 0,
    quotaBytes: Number(data.quota_bytes) || DEFAULT_ACADEMY_DRIVE_QUOTA,
  };
}

export async function createAcademyDriveFolder({
  academyId,
  parentId = null,
  name,
} = {}) {
  const user = await getCurrentUserOrThrow();
  const normalizedName = String(name || '').trim();
  if (!academyId) throw new Error('학원 정보를 찾을 수 없어요.');
  if (!normalizedName) throw new Error('폴더 이름을 입력해주세요.');
  if (normalizedName.length > 80) throw new Error('폴더 이름은 80자 이하로 입력해주세요.');
  if (normalizedName.includes('/')) throw new Error('폴더 이름에는 /를 사용할 수 없어요.');

  const { data, error } = await supabase
    .from('academy_drive_folders')
    .insert({
      academy_id: academyId,
      parent_id: parentId || null,
      name: normalizedName,
      created_by: user.id,
    })
    .select()
    .single();
  if (error?.code === '23505') throw new Error('같은 위치에 같은 이름의 폴더가 있어요.');
  if (error) throw error;
  return data;
}

export async function deleteAcademyDriveFolder(folderId) {
  assertSupabaseConfigured();
  if (!folderId) throw new Error('삭제할 폴더 정보를 찾을 수 없어요.');
  const { error } = await supabase
    .from('academy_drive_folders')
    .delete()
    .eq('id', folderId);
  if (error?.code === '23503') throw new Error('파일이나 하위 폴더가 남아 있는 폴더는 삭제할 수 없어요.');
  if (error) throw error;
}

export async function trashAcademyDriveFolder(folderId) {
  const user = await getCurrentUserOrThrow();
  if (!folderId) throw new Error('삭제할 폴더 정보를 찾을 수 없어요.');
  const { data, error } = await supabase
    .from('academy_drive_folders')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq('id', folderId)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function restoreAcademyDriveFolder(folderId) {
  assertSupabaseConfigured();
  if (!folderId) throw new Error('복구할 폴더 정보를 찾을 수 없어요.');
  const { data, error } = await supabase
    .from('academy_drive_folders')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', folderId)
    .not('deleted_at', 'is', null)
    .select()
    .single();
  if (error?.code === '23505') throw new Error('같은 위치에 같은 이름의 폴더가 있어요.');
  if (error?.code === '23503') throw new Error('상위 폴더를 먼저 복구해주세요.');
  if (error) throw error;
  return data;
}

async function permanentlyDeleteAcademyDriveFileById(fileId) {
  const data = await invokeAcademyDriveFile({ fileId, action: 'delete' });
  if (!data?.deleted) throw new Error(data?.error || '자료를 영구 삭제하지 못했어요.');
}

// metadata를 먼저 등록해야 Storage RLS가 이 경로의 업로드를 허용한다.
// 업로드 실패 시 metadata를 휴지통으로 전환한 뒤 Edge Function으로 정리한다.
export async function uploadAcademyDriveFile({
  academyId,
  folderId = null,
  file,
} = {}) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('학원 정보를 찾을 수 없어요.');
  if (!(file instanceof File)) throw new Error('업로드할 파일을 선택해주세요.');
  if (file.size <= 0) throw new Error('빈 파일은 업로드할 수 없어요.');
  if (file.size > MAX_DRIVE_FILE_SIZE) throw new Error('파일은 50MB 이하만 업로드할 수 있어요.');
  const extension = extensionFrom(file.name).slice(1);
  if (!ALLOWED_DRIVE_EXTENSIONS.has(extension)) {
    throw new Error('지원하지 않는 파일 형식이에요.');
  }

  const storagePath = createStoragePath(academyId, file);
  const mimeType = file.type || 'application/octet-stream';
  let metadata = null;
  try {
    const { data, error } = await supabase
      .from('academy_drive_files')
      .insert({
        academy_id: academyId,
        storage_path: storagePath,
        original_name: file.name.slice(0, 255),
        mime_type: mimeType,
        size_bytes: file.size,
        folder_id: folderId || null,
        download_allowed: true,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;
    metadata = data;

    const { error: uploadError } = await supabase.storage
      .from(ACADEMY_DRIVE_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        contentType: mimeType,
        upsert: false,
      });
    if (uploadError) throw uploadError;
    return metadata;
  } catch (error) {
    if (metadata?.id) {
      try {
        await supabase
          .from('academy_drive_files')
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by: user.id,
          })
          .eq('id', metadata.id);
        await permanentlyDeleteAcademyDriveFileById(metadata.id);
      } catch {
        // 원래 업로드 오류를 사용자에게 유지한다. 고아 metadata는 휴지통에서
        // 다시 정리할 수 있고 감사 로그에도 남는다.
      }
    }
    throw error;
  }
}

export async function updateAcademyDriveDownloadAllowed(fileId, downloadAllowed) {
  assertSupabaseConfigured();
  if (!fileId) throw new Error('파일 정보를 찾을 수 없어요.');
  const { data, error } = await supabase
    .from('academy_drive_files')
    .update({ download_allowed: Boolean(downloadAllowed) })
    .eq('id', fileId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function trashAcademyDriveFile(fileId) {
  const user = await getCurrentUserOrThrow();
  if (!fileId) throw new Error('삭제할 파일 정보를 찾을 수 없어요.');
  const { data, error } = await supabase
    .from('academy_drive_files')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq('id', fileId)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function restoreAcademyDriveFile(fileId) {
  assertSupabaseConfigured();
  if (!fileId) throw new Error('복구할 파일 정보를 찾을 수 없어요.');
  const { data, error } = await supabase
    .from('academy_drive_files')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', fileId)
    .not('deleted_at', 'is', null)
    .select()
    .single();
  if (error?.code === '23503') throw new Error('파일이 있던 폴더를 먼저 복구해주세요.');
  if (error?.code === '54000') throw new Error('드라이브 저장 용량을 초과해 복구할 수 없어요.');
  if (error) throw error;
  return data;
}

export async function deleteAcademyDriveFile(file) {
  if (!file?.id) throw new Error('삭제할 파일 정보를 찾을 수 없어요.');
  await permanentlyDeleteAcademyDriveFileById(file.id);
}

// action: view | print | download. 영구 삭제는 내부 helper만 호출한다.
// Edge Function은 active 멤버십을 확인하며, download는 관리자 또는
// download_allowed=true인 파일에만 URL을 발급한다.
export async function getAcademyDriveFileUrl(fileId, action = 'view') {
  assertSupabaseConfigured();
  if (!fileId) throw new Error('파일 정보를 찾을 수 없어요.');
  if (!['view', 'print', 'download'].includes(action)) {
    throw new Error('잘못된 파일 요청이에요.');
  }
  const data = await invokeAcademyDriveFile({ fileId, action });
  if (!data?.url) throw new Error('파일 주소를 만들지 못했어요.');
  return data.url;
}
