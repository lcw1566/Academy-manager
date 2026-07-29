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

export async function listAcademyDriveFiles(academyId) {
  assertSupabaseConfigured();
  if (!academyId) return [];
  const { data, error } = await supabase
    .from('academy_drive_files')
    .select('*')
    .eq('academy_id', academyId)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data ?? [];
}

export async function listAcademyDriveFolders(academyId) {
  assertSupabaseConfigured();
  if (!academyId) return [];
  const { data, error } = await supabase
    .from('academy_drive_folders')
    .select('*')
    .eq('academy_id', academyId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return data ?? [];
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

// 파일과 메타데이터를 모두 등록한다. 메타데이터 insert가 실패하면 막 업로드한
// object를 바로 정리해 고아 파일이 남지 않게 한다.
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

  const storagePath = createStoragePath(academyId, file);
  const mimeType = file.type || 'application/octet-stream';
  const { error: uploadError } = await supabase.storage
    .from(ACADEMY_DRIVE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      contentType: mimeType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

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
    return data;
  } catch (error) {
    // owner-only Storage 정책에 맞춰, 실패한 메타데이터에 연결된 파일은 회수한다.
    await supabase.storage.from(ACADEMY_DRIVE_BUCKET).remove([storagePath]).catch(() => {});
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

export async function deleteAcademyDriveFile(file) {
  assertSupabaseConfigured();
  if (!file?.id || !file?.storage_path) throw new Error('삭제할 파일 정보를 찾을 수 없어요.');

  // Storage object를 먼저 제거한다. 실패 시 DB 메타데이터는 남아 있어 관리자가
  // 다시 시도할 수 있고, 성공 뒤 DB 삭제가 실패해도 목록에서 복구/정리할 근거가 남는다.
  const { error: storageError } = await supabase.storage
    .from(ACADEMY_DRIVE_BUCKET)
    .remove([file.storage_path]);
  if (storageError) throw storageError;

  const { error } = await supabase
    .from('academy_drive_files')
    .delete()
    .eq('id', file.id);
  if (error) throw error;
}

// action: view | print | download
// Edge Function은 active 멤버십을 확인하며, download는 관리자 또는
// download_allowed=true인 파일에만 URL을 발급한다.
export async function getAcademyDriveFileUrl(fileId, action = 'view') {
  assertSupabaseConfigured();
  if (!fileId) throw new Error('파일 정보를 찾을 수 없어요.');
  if (!['view', 'print', 'download'].includes(action)) {
    throw new Error('잘못된 파일 요청이에요.');
  }
  const { data, error } = await supabase.functions.invoke('academy-drive-file', {
    body: { fileId, action },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('파일 주소를 만들지 못했어요.');
  return data.url;
}
