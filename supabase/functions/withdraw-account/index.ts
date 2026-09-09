import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

// auth.users를 삭제하면 연결된 과거 기록이 cascade로 함께 사라질 수 있다.
// 따라서 사용자 ID는 보존하고 이메일/프로필을 익명화한 뒤 장기 차단한다.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'));
    const accessToken = (req.headers.get('Authorization') || '')
      .replace(/^Bearer\s+/i, '')
      .trim();
    if (!accessToken) return json({ error: '로그인이 필요해요.' }, 401);

    const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
    const user = userData?.user;
    if (userError || !user) {
      return json({ error: '로그인 정보가 만료됐어요. 다시 로그인해주세요.' }, 401);
    }

    const { count: ownedAcademyCount, error: academyError } = await admin
      .from('academies')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id);
    if (academyError) throw academyError;
    if ((ownedAcademyCount || 0) > 0) {
      return json({
        error: '원장 계정은 바로 탈퇴할 수 없어요. 학원 소유권 이전 또는 학원 삭제가 먼저 필요해요.',
      }, 409);
    }

    const withdrawnEmail = `withdrawn-${user.id}@invalid.seenit.local`;

    // 멤버십/직원/근무/프로필/푸시 토큰 변경은 DB 함수 안에서 전부 성공하거나
    // 전부 롤백된다. 기존의 여러 REST 요청은 중간 실패 시 반쪽 탈퇴가 됐다.
    const { error: withdrawalDataError } = await admin.rpc('withdraw_account_data', {
      p_user_id: user.id,
      p_withdrawn_email: withdrawnEmail,
    });
    if (withdrawalDataError) throw withdrawalDataError;

    const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
      email: withdrawnEmail,
      email_confirm: true,
      password: `${crypto.randomUUID()}-${crypto.randomUUID()}`,
      ban_duration: '876000h',
      user_metadata: { ...(user.user_metadata || {}), withdrawn: true },
    });
    if (authError) throw authError;

    return json({ withdrawn: true });
  } catch (error) {
    console.error('[withdraw-account]', error);
    return json({ error: '탈퇴 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.' }, 500);
  }
});
