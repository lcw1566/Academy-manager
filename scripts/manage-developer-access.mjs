import { createClient } from '@supabase/supabase-js';

const [action, userId, requestedRole = 'developer'] = process.argv.slice(2);
const allowedRoles = new Set(['developer', 'support', 'viewer']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!['grant', 'revoke'].includes(action) || !uuidPattern.test(userId || '')) {
  console.error('사용법: npm run developer:access -- <grant|revoke> <사용자 UUID> [developer|support|viewer]');
  process.exit(1);
}
if (action === 'grant' && !allowedRoles.has(requestedRole)) {
  console.error('역할은 developer, support, viewer 중 하나여야 합니다.');
  process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error('.env.local의 VITE_SUPABASE_URL과 SUPABASE_SECRET_KEY가 필요합니다.');
  process.exit(1);
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const result = action === 'grant'
  ? await admin.from('app_developers').upsert({
      user_id: userId,
      role: requestedRole,
      is_active: true,
    }, { onConflict: 'user_id' })
  : await admin.from('app_developers').update({ is_active: false }).eq('user_id', userId);

if (result.error) {
  console.error(`개발자 권한 ${action === 'grant' ? '등록' : '해제'} 실패: ${result.error.message}`);
  process.exit(1);
}

console.log(`개발자 권한을 ${action === 'grant' ? '등록' : '해제'}했습니다.`);
