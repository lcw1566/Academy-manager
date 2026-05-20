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

export async function upsertProfile({ displayName, defaultRole, accountType } = {}) {
  const user = await getCurrentUserOrThrow();

  const payload = {
    id: user.id,
    email: user.email ?? null,
  };
  if (displayName !== undefined) payload.display_name = displayName;
  if (defaultRole !== undefined) payload.default_role = defaultRole;
  if (accountType !== undefined) payload.account_type = accountType;

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 회원가입 직후 / 프로필 설정에서 account_type 갱신용.
// account_type: 'tutor' | 'owner' | 'staff'
// default_role 도 매핑해 함께 저장한다 (앱 호환).
//   tutor -> default_role='tutor'
//   owner -> default_role='owner'
//   staff -> default_role='teacher' (학원 멤버십에서 teacher/assistant 가 갈리므로 기본값을 teacher 로 둔다)
export async function updateMyProfileAccountType({ accountType, defaultRole, displayName } = {}) {
  if (!accountType) throw new Error('accountType이 필요해요.');
  if (!['tutor', 'owner', 'staff'].includes(accountType)) {
    throw new Error('accountType은 tutor/owner/staff 중 하나여야 해요.');
  }
  const resolvedDefaultRole =
    defaultRole !== undefined
      ? defaultRole
      : accountType === 'tutor'
      ? 'tutor'
      : accountType === 'owner'
      ? 'owner'
      : 'teacher';
  return upsertProfile({
    accountType,
    defaultRole: resolvedDefaultRole,
    displayName,
  });
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

// ────────────────────────────────────────────────────────────────
// profile lookup (best-effort)
// ────────────────────────────────────────────────────────────────

// 이메일로 사용자 검색.
// 주의: profiles RLS 가 "본인 row 만 select" 이므로, 다른 사용자의 row 는
// 사실상 조회되지 않는다. 따라서 이 함수는 best-effort 로 동작한다:
//   - 본인 이메일을 검색하면 본인 row 반환
//   - 그 외에는 거의 항상 null 반환
// 가입 여부 확인은 invitation 수락 단계에서 실제로 확인된다 (이메일이
// 일치하는 사용자가 로그인해서 수락해야만 academy_members 가 만들어진다).
// 이 함수의 가치는 "원장 본인을 잘못 초대하지 않게" 정도이며, 그 외의
// 가입 확인은 UX 상 "초대 row 가 만들어졌다" 안내로 대체한다.
export async function findProfileByEmail(email) {
  assertSupabaseConfigured();
  const cleaned = (email ?? '').trim().toLowerCase();
  if (!cleaned) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, account_type')
    .ilike('email', cleaned)
    .limit(1)
    .maybeSingle();
  if (error) {
    // RLS 차단으로 인한 0-row 응답이 error 로 오지는 않지만, 다른 종류의 에러는 상위로 노출
    throw error;
  }
  return data ?? null;
}


// ────────────────────────────────────────────────────────────────
// academy_invitations
// ────────────────────────────────────────────────────────────────

function normalizeEmail(email) {
  return (email ?? '').trim().toLowerCase();
}

function assertInviteRole(role) {
  if (!['teacher', 'assistant'].includes(role)) {
    throw new Error('초대 역할은 강사 또는 보조강사여야 해요.');
  }
}

// 원장이 강사/보조강사를 초대.
// 같은 (academy_id, email, role) 가 이미 존재하면 status 를 'pending' 으로 되살린다.
// (취소했다가 다시 초대하는 시나리오 지원)
export async function createAcademyInvitation({ academyId, email, role }) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const cleanedEmail = normalizeEmail(email);
  if (!cleanedEmail) throw new Error('이메일을 입력해주세요.');
  assertInviteRole(role);

  const payload = {
    academy_id: academyId,
    email: cleanedEmail,
    role,
    status: 'pending',
    invited_by: user.id,
    accepted_user_id: null,
  };

  const { data, error } = await supabase
    .from('academy_invitations')
    .upsert(payload, { onConflict: 'academy_id,email,role' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 원장이 본인 학원의 초대 목록 조회.
// RLS 가 owner 또는 본인 이메일 매칭만 허용하므로, 학원 owner 가 호출하면
// 해당 학원의 전체 초대가 보인다.
export async function listAcademyInvitations(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('academy_invitations')
    .select('*')
    .eq('academy_id', academyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// 강사/보조강사가 본인 이메일로 받은 pending 초대 조회.
// academy 정보도 함께 join (이름 표시용).
// RLS: 본인 이메일과 일치하는 invitation 만 보임.
export async function listMyPendingInvitations() {
  const user = await getCurrentUserOrThrow();
  const cleanedEmail = normalizeEmail(user.email);
  if (!cleanedEmail) return [];
  const { data, error } = await supabase
    .from('academy_invitations')
    .select('*, academy:academies(id, name, owner_id)')
    .eq('status', 'pending')
    .ilike('email', cleanedEmail)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// 강사/보조강사가 초대 수락.
// 1) invitation 조회 + 본인 이메일 일치 검증
// 2) academy_members 에 (academy_id, user_id, role) 행 upsert (status='active')
// 3) invitation 자체를 status='accepted', accepted_user_id=user.id 로 update
//
// 주의: 두 작업 사이가 트랜잭션이 아니다. academy_members upsert 가 성공한 뒤
// invitation update 가 실패하면 invitation 은 pending 으로 남는다 (이미 멤버는
// 됐으니 큰 문제는 없고, 재수락 시 academy_members upsert 가 멱등).
export async function acceptAcademyInvitation(invitationId) {
  const user = await getCurrentUserOrThrow();
  if (!invitationId) throw new Error('invitationId가 필요해요.');
  const cleanedEmail = normalizeEmail(user.email);

  // Step 1: invitation 조회
  const { data: invitation, error: fetchErr } = await supabase
    .from('academy_invitations')
    .select('*, academy:academies(id, name, owner_id)')
    .eq('id', invitationId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!invitation) throw new Error('초대를 찾을 수 없어요.');
  if (invitation.status !== 'pending') {
    throw new Error('이미 처리된 초대예요.');
  }
  if (normalizeEmail(invitation.email) !== cleanedEmail) {
    throw new Error('초대받은 이메일과 로그인 이메일이 달라요.');
  }
  assertInviteRole(invitation.role);

  // Step 2: academy_members 에 active 멤버로 추가
  // 기존 행이 있으면 role/status 를 갱신 (재초대 케이스)
  const { error: memberErr } = await supabase
    .from('academy_members')
    .upsert(
      {
        academy_id: invitation.academy_id,
        user_id: user.id,
        role: invitation.role,
        status: 'active',
      },
      { onConflict: 'academy_id,user_id' },
    );
  if (memberErr) throw memberErr;

  // Step 3: invitation 마감 처리
  const { error: updateErr } = await supabase
    .from('academy_invitations')
    .update({
      status: 'accepted',
      accepted_user_id: user.id,
    })
    .eq('id', invitationId);
  if (updateErr) {
    // 멤버는 들어갔지만 invitation 상태 업데이트 실패. 사용자에게는 성공으로
    // 노출해도 무방하지만, 로그를 위해 throw 한다.
    throw updateErr;
  }

  return {
    academyId: invitation.academy_id,
    academy: invitation.academy ?? null,
    role: invitation.role,
  };
}

// 원장이 보낸 초대 취소.
// status='canceled' update 로 처리 (delete 정책 없음).
export async function cancelAcademyInvitation(invitationId) {
  assertSupabaseConfigured();
  if (!invitationId) throw new Error('invitationId가 필요해요.');
  const { data, error } = await supabase
    .from('academy_invitations')
    .update({ status: 'canceled', accepted_user_id: null })
    .eq('id', invitationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 이미 가입된 사용자를 즉시 멤버로 추가 (관리자 도구용).
// 현재 UI 흐름은 invitation 수락을 거치므로 일반적으로는 사용하지 않는다.
// owner 만 실행 가능하다는 보장은 RLS (academy_members insert by owner) 가 제공.
export async function addAcademyMemberByUserId({ academyId, userId, role }) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!userId) throw new Error('userId가 필요해요.');
  assertInviteRole(role);
  const { data, error } = await supabase
    .from('academy_members')
    .upsert(
      {
        academy_id: academyId,
        user_id: userId,
        role,
        status: 'active',
      },
      { onConflict: 'academy_id,user_id' },
    )
    .select()
    .single();
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
