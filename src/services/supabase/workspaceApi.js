// workspaceApi.js
//
// profiles / academies / academy_members 에 접근하는 기본 API 레이어.
// 이 파일은 Step 3 단계로 만들어진 것이며, 아직 UI에 강제 연결되어 있지 않습니다.
//
// 모든 함수는 supabase 미설정 / 미로그인 시 친절한 에러를 throw 합니다.

import { supabase, isSupabaseConfigured } from '../../lib/supabase';

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase가 설정되지 않았어요. .env.local을 확인해주세요.');
  }
}

async function getCurrentUserOrThrow() {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error('로그인이 필요해요.');
  return data.user;
}

// ────────────────────────────────────────────────────────────────
// profiles
// ────────────────────────────────────────────────────────────────

export async function getProfile() {
  const user = await getCurrentUserOrThrow();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data; // 없으면 null
}

export async function upsertProfile({ displayName, defaultRole } = {}) {
  const user = await getCurrentUserOrThrow();

  const payload = {
    id: user.id,
    email: user.email ?? null,
  };
  if (displayName !== undefined) payload.display_name = displayName;
  if (defaultRole !== undefined) payload.default_role = defaultRole;

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ────────────────────────────────────────────────────────────────
// academies / academy_members
// ────────────────────────────────────────────────────────────────

export async function getMyAcademyMemberships() {
  const user = await getCurrentUserOrThrow();
  const { data, error } = await supabase
    .from('academy_members')
    .select('*, academy:academies(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getAcademyById(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('academies')
    .select('*')
    .eq('id', academyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 학원 생성 + 본인을 owner 멤버로 등록 (2-step).
// 진정한 원자성이 필요해지면 추후 SQL RPC로 옮길 예정.
export async function createAcademyAsOwner({ name }) {
  const user = await getCurrentUserOrThrow();
  const trimmed = (name ?? '').trim();
  if (!trimmed) throw new Error('학원 이름을 입력해주세요.');

  // Step 1: academies row 생성
  const { data: academy, error: aErr } = await supabase
    .from('academies')
    .insert({ name: trimmed, owner_id: user.id })
    .select()
    .single();
  if (aErr) throw aErr;

  // Step 2: academy_members 에 owner 로 등록
  const { error: mErr } = await supabase
    .from('academy_members')
    .insert({
      academy_id: academy.id,
      user_id: user.id,
      role: 'owner',
      status: 'active',
    });
  if (mErr) {
    // 학원은 생성되었지만 멤버 등록 실패.
    // academies delete 정책이 없으므로 자동 cleanup 불가 → 에러만 전달.
    throw new Error(
      `학원은 생성되었으나 owner 멤버 등록에 실패했어요: ${mErr.message}`
    );
  }

  return academy;
}
