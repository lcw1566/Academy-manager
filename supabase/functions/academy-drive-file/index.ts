import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type FileAction = 'view' | 'print' | 'download' | 'delete';

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

// 비공개 academy-drive object에 대한 60초짜리 signed URL을 발급한다.
// 이 함수가 일반 직원의 유일한 file-content 진입점이다. Storage RLS는 owner에게만
// object 직접 select를 허용하므로, 클라이언트에서 Storage SDK로 우회할 수 없다.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabaseUrl = required('SUPABASE_URL');
    const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = req.headers.get('Authorization') || '';
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) return json({ error: '로그인이 필요해요.' }, 401);

    // 서비스 역할 클라이언트로 전달된 사용자 JWT를 직접 검증한다. 별도
    // userClient/anon 환경변수 상태에 따라 인증 결과가 달라지지 않는다.
    const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return json({ error: '로그인 정보가 만료됐어요. 다시 로그인해주세요.' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const fileId = typeof body?.fileId === 'string' ? body.fileId : '';
    const action = body?.action as FileAction;
    if (!fileId || !['view', 'print', 'download', 'delete'].includes(action)) {
      return json({ error: '잘못된 파일 요청이에요.' }, 400);
    }

    const { data: file, error: fileError } = await admin
      .from('academy_drive_files')
      .select('id, academy_id, storage_path, original_name, download_allowed, deleted_at')
      .eq('id', fileId)
      .maybeSingle();
    if (fileError) throw fileError;
    if (!file) return json({ error: '자료를 찾을 수 없어요.' }, 404);
    if (!file.storage_path.startsWith(`${file.academy_id}/`)) {
      console.error('[academy-drive-file] invalid storage path', {
        fileId: file.id,
        academyId: file.academy_id,
      });
      return json({ error: '자료의 저장 경로가 올바르지 않아요.' }, 409);
    }

    const { data: membership, error: membershipError } = await admin
      .from('academy_members')
      .select('role')
      .eq('academy_id', file.academy_id)
      .eq('user_id', userData.user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json({ error: '이 자료를 처리할 권한이 없어요.' }, 403);

    if (action === 'delete') {
      if (!file.deleted_at) {
        return json({ error: '먼저 자료를 휴지통으로 이동해주세요.' }, 409);
      }

      const { error: storageError } = await admin.storage
        .from('academy-drive')
        .remove([file.storage_path]);
      if (storageError) throw storageError;

      const { data: deletedMetadata, error: metadataError } = await admin
        .from('academy_drive_files')
        .delete()
        .eq('id', file.id)
        .not('deleted_at', 'is', null)
        .select('id')
        .maybeSingle();
      if (metadataError) throw metadataError;
      if (!deletedMetadata?.id) {
        return json({ error: '이미 복구됐거나 삭제된 자료예요. 목록을 새로고침해주세요.' }, 409);
      }

      return json({ deleted: true });
    }

    if (file.deleted_at) return json({ error: '휴지통에 있는 자료예요.' }, 410);

    const isOwner = membership.role === 'owner';
    if (action === 'download' && !isOwner && !file.download_allowed) {
      return json({ error: '이 자료는 다운로드가 제한되어 있어요.' }, 403);
    }

    const options = action === 'download' ? { download: file.original_name } : undefined;
    const { data: signed, error: signError } = await admin.storage
      .from('academy-drive')
      .createSignedUrl(file.storage_path, 60, options);
    if (signError) throw signError;
    if (!signed?.signedUrl) throw new Error('파일 주소를 만들지 못했어요.');

    return json({ url: signed.signedUrl, expiresIn: 60 });
  } catch (error) {
    console.error('[academy-drive-file]', error);
    return json({
      error: '파일 서버에서 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
    }, 500);
  }
});
