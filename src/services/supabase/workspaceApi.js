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

export async function upsertProfile({ displayName, defaultRole, accountType, phone } = {}) {
  const user = await getCurrentUserOrThrow();

  const payload = {
    id: user.id,
    email: user.email ?? null,
  };
  if (displayName !== undefined) payload.display_name = displayName;
  if (defaultRole !== undefined) payload.default_role = defaultRole;
  if (accountType !== undefined) payload.account_type = accountType;
  if (phone !== undefined) payload.phone = phone;

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Profile edit helper for end users (display_name + phone).
// Used by the profile-edit modal in More. Account type stays read-only here;
// users change it via the dedicated setMyAccountType action.
export async function updateMyProfileBasic({ displayName, phone } = {}) {
  return upsertProfile({ displayName, phone });
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
// Post-Phase 32 — search_profile_by_email RPC (SQL 007) 사용.
//
// profiles RLS 가 "본인 row 만 select" 라서 직접 select 로는 다른 사용자 검색이
// 불가능했다. SQL 007 의 security definer RPC 는 exact email 일치만 허용하고
// 제한된 컬럼(id/email/display_name/phone/account_type) 만 반환하므로 안전하다.
//
// 동작:
//   - 이메일 lowercase + trim
//   - 빈 값 / 너무 짧으면 즉시 null
//   - RPC 호출. 실패해도 invite flow 가 계속 동작하도록 console.warn + null 반환.
export async function findProfileByEmail(email) {
  assertSupabaseConfigured();
  const cleaned = (email ?? '').trim().toLowerCase();
  if (!cleaned || cleaned.length < 3) return null;
  try {
    const { data, error } = await supabase.rpc('search_profile_by_email', {
      p_email: cleaned,
    });
    if (error) {
      // RPC 가 아직 배포 안 됐거나 (404) 권한 이슈 등은 모두 null 로 fallback.
      console.warn('[findProfileByEmail] RPC failed', error);
      return null;
    }
    if (Array.isArray(data) && data.length > 0) return data[0];
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    return null;
  } catch (err) {
    console.warn('[findProfileByEmail] threw', err);
    return null;
  }
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
//
// IMPORTANT: academy_members.insert RLS 는 owner 한정이므로 일반 사용자는
// 자기 자신의 멤버 행을 직접 insert 할 수 없다. 그래서 SQL 005 의
// security definer RPC `accept_academy_invitation` 를 호출한다. 함수 내부에서:
//   - auth.uid() / auth.email() 검증
//   - invitation 존재 + status='pending' 확인
//   - email 일치 확인
//   - academy_members upsert + invitation update 를 한 트랜잭션으로 처리
//
// 그 외 RLS 정책은 그대로 유지된다. RPC 가 유일한 합법적 우회 경로다.
export async function acceptAcademyInvitation(invitationId) {
  assertSupabaseConfigured();
  if (!invitationId) throw new Error('invitationId가 필요해요.');

  // Call the security definer RPC. It returns one row:
  //   { out_invitation_id, out_academy_id, out_role, out_accepted_user_id }
  // (OUT params are prefixed with out_ to avoid colliding with column names
  //  of the same name inside the function body.)
  const { data, error } = await supabase.rpc('accept_academy_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) {
    // RPC raises typed exceptions with Korean messages. Surface them.
    throw new Error(error.message || '초대 수락에 실패했어요.');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('초대 수락 결과가 없어요.');

  const academyId = row.out_academy_id;
  const role = row.out_role;

  // Optional: fetch academy display info for the caller (toast / store).
  let academy = null;
  try {
    academy = await getAcademyById(academyId);
  } catch {
    // best-effort; not blocking
  }

  return { academyId, academy, role };
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


// Phase 39 — 학원 단위 급여/수강료 일자 설정 업데이트 (owner only via RLS).
// SQL 009 가 1~31 범위 check 제약을 강제하므로, 잘못된 값은 서버에서도 차단된다.
export async function updateAcademyBillingSettings(academyId, { salaryPaymentDay, tuitionDueDay }) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const patch = {};
  if (salaryPaymentDay != null) {
    const n = Number(salaryPaymentDay);
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      throw new Error('급여 지급일은 1~31 사이여야 해요.');
    }
    patch.salary_payment_day = n;
  }
  if (tuitionDueDay != null) {
    const n = Number(tuitionDueDay);
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      throw new Error('수강료 납부일은 1~31 사이여야 해요.');
    }
    patch.tuition_due_day = n;
  }
  if (Object.keys(patch).length === 0) return null;
  const { data, error } = await supabase
    .from('academies')
    .update(patch)
    .eq('id', academyId)
    .select()
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


// ────────────────────────────────────────────────────────────────
// academy member profile lookup (SQL 004)
// ────────────────────────────────────────────────────────────────

// Lists basic profile info (display_name/email/phone/account_type) for users
// who are active members of the given academy. Uses the security definer
// function from SQL 004 so the caller only sees rows when they're the
// academy owner. Returns [] if not the owner or if the function isn't
// available yet (graceful fallback).
export async function listAcademyMemberProfiles(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase.rpc('list_academy_member_profiles', {
    p_academy_id: academyId,
  });
  if (error) {
    // If the function is missing (SQL 004 not yet applied) we don't want
    // to break the UI — fall back to empty.
    if ((error.code || '').toLowerCase() === '42883') return [];
    throw error;
  }
  return data ?? [];
}


// ────────────────────────────────────────────────────────────────
// academy_staff_profiles (SQL 004)
// ────────────────────────────────────────────────────────────────

function sanitizeStaffProfilePayload(input = {}) {
  const out = {};
  const toWonInteger = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n));
  };
  if (input.role !== undefined) out.role = input.role;
  if (input.subject !== undefined) out.subject = input.subject;
  if (input.subjects !== undefined) {
    out.subjects = Array.isArray(input.subjects) ? input.subjects : [];
  }
  if (input.wageType !== undefined) {
    out.wage_type = input.wageType || null;
  }
  if (input.hourlyWage !== undefined) {
    out.hourly_wage = toWonInteger(input.hourlyWage);
  }
  if (input.monthlySalary !== undefined) {
    out.monthly_salary = toWonInteger(input.monthlySalary);
  }
  if (input.memo !== undefined) out.memo = input.memo;
  if (input.status !== undefined) out.status = input.status;
  if (input.memberId !== undefined) out.member_id = input.memberId;
  // Phase 30 — permissions / scope (jsonb). SQL 006 에서 컬럼 추가.
  if (input.permissions !== undefined) {
    out.permissions = input.permissions && typeof input.permissions === 'object' ? input.permissions : {};
  }
  if (input.scope !== undefined) {
    out.scope = input.scope && typeof input.scope === 'object' ? input.scope : {};
  }
  return out;
}

// Owner-side list of academy-specific staff settings.
export async function listAcademyStaffProfiles(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase
    .from('academy_staff_profiles')
    .select('*')
    .eq('academy_id', academyId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Owner creates or updates a staff profile row. Keyed by (academy_id, user_id).
// The caller passes role + academy-managed fields. Basic identity (name/email/
// phone) is NOT stored here — that lives on public.profiles.
export async function upsertAcademyStaffProfile({ academyId, userId, ...rest }) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!userId) throw new Error('userId가 필요해요.');
  if (rest.role && !['teacher', 'assistant'].includes(rest.role)) {
    throw new Error('role 은 teacher 또는 assistant 여야 해요.');
  }
  const payload = {
    academy_id: academyId,
    user_id: userId,
    ...sanitizeStaffProfilePayload(rest),
  };
  const { data, error } = await supabase
    .from('academy_staff_profiles')
    .upsert(payload, { onConflict: 'academy_id,user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Soft-delete via status='inactive' (no delete policy on the table).
export async function deactivateAcademyStaffProfile({ academyId, userId }) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!userId) throw new Error('userId가 필요해요.');
  const { data, error } = await supabase
    .from('academy_staff_profiles')
    .update({ status: 'inactive' })
    .eq('academy_id', academyId)
    .eq('user_id', userId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}
