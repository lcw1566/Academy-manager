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
    const anonKey = required('SUPABASE_ANON_KEY');
    const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = req.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const fileId = typeof body?.fileId === 'string' ? body.fileId : '';
    const action = body?.action as FileAction;
    if (!fileId || !['view', 'print', 'download', 'delete'].includes(action)) {
      return json({ error: 'fileId and a valid action are required' }, 400);
    }

    const { data: file, error: fileError } = await admin
      .from('academy_drive_files')
      .select('id, academy_id, storage_path, original_name, download_allowed, deleted_at')
      .eq('id', fileId)
      .maybeSingle();
    if (fileError) throw fileError;
    if (!file) return json({ error: 'Not found' }, 404);

    const { data: membership, error: membershipError } = await admin
      .from('academy_members')
      .select('role')
      .eq('academy_id', file.academy_id)
      .eq('user_id', userData.user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json({ error: 'Forbidden' }, 403);

    if (action === 'delete') {
      if (!file.deleted_at) {
        return json({ error: '먼저 자료를 휴지통으로 이동해주세요.' }, 409);
      }

      const { error: storageError } = await admin.storage
        .from('academy-drive')
        .remove([file.storage_path]);
      if (storageError) throw storageError;

      const { error: metadataError } = await admin
        .from('academy_drive_files')
        .delete()
        .eq('id', file.id)
        .not('deleted_at', 'is', null);
      if (metadataError) throw metadataError;

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
    if (!signed?.signedUrl) throw new Error('Could not create signed URL');

    return json({ url: signed.signedUrl, expiresIn: 60 });
  } catch (error) {
    console.error('[academy-drive-file]', error);
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});
