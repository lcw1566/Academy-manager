import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetEmail = String(process.argv[2] || '').trim().toLowerCase();
const targetPassword = process.env.TARGET_USER_PASSWORD;

if (!supabaseUrl) {
  console.error('SUPABASE_URL 또는 VITE_SUPABASE_URL이 필요합니다.');
  process.exit(1);
}
if (!adminKey) {
  console.error('SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  console.error('관리자 키에 브라우저용 VITE_ 접두사를 붙이지 마세요.');
  process.exit(1);
}
if (!targetEmail) {
  console.error('사용법: npm run auth:reset-password -- user@example.com');
  process.exit(1);
}
if (!targetPassword) {
  console.error('TARGET_USER_PASSWORD 환경 변수로 새 비밀번호를 전달해주세요.');
  process.exit(1);
}
if (targetPassword.length < 8) {
  console.warn('주의: 8자 미만 비밀번호는 취약하며 프로젝트 보안 정책에서 거부될 수 있습니다.');
}

const admin = createClient(supabaseUrl, adminKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

async function findUserByEmail(email) {
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const matched = users.find((user) => String(user.email || '').trim().toLowerCase() === email);
    if (matched) return matched;
    if (users.length < perPage) return null;
  }
  throw new Error('사용자 목록이 너무 커서 검색을 완료하지 못했습니다.');
}

try {
  const user = await findUserByEmail(targetEmail);
  if (!user) {
    console.error(`사용자를 찾을 수 없습니다: ${targetEmail}`);
    process.exit(1);
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: targetPassword,
  });
  if (error) throw error;

  console.log(`비밀번호를 변경했습니다: ${targetEmail}`);
} catch (error) {
  console.error(`비밀번호 변경 실패: ${error?.message || error}`);
  process.exit(1);
}
