// workspaceApi.js
//
// profiles / academies / academy_members 에 접근하는 기본 API 레이어.
// 이 파일은 Step 3 단계로 만들어진 것이며, 아직 UI에 강제 연결되어 있지 않습니다.
//
// 모든 함수는 supabase 미설정 / 미로그인 시 친절한 에러를 throw 합니다.

import { supabase, isSupabaseConfigured } from '../../lib/supabase';

const STARTUP_QUERY_TIMEOUT_MS = 8000;

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase가 설정되지 않았어요. .env.local을 확인해주세요.');
  }
}

async function getCurrentUserOrThrow() {
  assertSupabaseConfigured();
  // 앱 시작 시 initializeAuth에서 이미 세션을 확인한다. 여기서 매 API 호출마다
  // getUser()로 인증 서버를 다시 왕복하면 로그인 직후 요청이 한꺼번에 밀리므로,
  // 로컬에 보관된 세션을 재사용한다. 실제 접근 권한은 서버 RLS가 계속 검증한다.
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data?.session?.user) throw new Error('로그인이 필요해요.');
  return data.session.user;
}

async function runStartupQuery(buildQuery, timeoutMessage) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STARTUP_QUERY_TIMEOUT_MS);
  try {
    const result = await buildQuery(controller.signal);
    if (controller.signal.aborted) {
      throw new Error(timeoutMessage);
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ────────────────────────────────────────────────────────────────
// profiles
// ────────────────────────────────────────────────────────────────

export async function getProfile() {
  const user = await getCurrentUserOrThrow();
  const { data, error } = await runStartupQuery(
    (signal) => supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .abortSignal(signal)
      .maybeSingle(),
    '프로필 확인 시간이 초과됐어요.',
  );
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
//   staff -> default_role='teacher' (레거시 호환용 기본값일 뿐, 실제 학원 접근과
//            역할은 academy_members의 active 멤버십 및 역할 배정으로 결정한다)
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

export async function getMyAcademyMemberships({ includeAcademy = true } = {}) {
  const user = await getCurrentUserOrThrow();
  const { data, error } = await runStartupQuery(
    (signal) => supabase
      .from('academy_members')
      // 로그인 필수 경로에서는 academies 조인을 생략할 수 있다. 학원 설정
      // 테이블의 DDL/RLS가 지연돼도 본인의 소속과 역할 확인까지 막히지 않는다.
      .select(includeAcademy ? '*, academy:academies(*)' : '*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .abortSignal(signal),
    '학원 권한 확인 시간이 초과됐어요.',
  );
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

function assertStaffRole(role) {
  if (!['teacher', 'manager'].includes(role)) {
    throw new Error('직원 역할은 선생님 또는 운영 매니저여야 해요.');
  }
}

// 원장 또는 운영 매니저가 역할을 정해 직원을 초대한다.
// 직원은 수락만 하면 바로 active 멤버가 된다. SQL 026의 pending 초대는 기존
// 초대와 예외 상황을 위한 호환 경로로 계속 지원한다.
export async function createAcademyInvitation({ academyId, email, role = 'teacher' }) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const cleanedEmail = normalizeEmail(email);
  if (!cleanedEmail) throw new Error('이메일을 입력해주세요.');
  assertStaffRole(role);

  // 한 이메일에 역할별 초대가 여러 장 생기지 않도록 현재 열린 초대를 먼저 찾는다.
  const { data: existingRows, error: existingError } = await supabase
    .from('academy_invitations')
    .select('id, status, role')
    .eq('academy_id', academyId)
    .eq('email', cleanedEmail)
    .order('created_at', { ascending: false });
  if (existingError) throw existingError;
  if ((existingRows || []).some((row) => row.status === 'accepted')) {
    throw new Error('이 직원은 이미 초대를 수락했어요. 직원 목록에서 역할을 변경해주세요.');
  }

  const payload = {
    academy_id: academyId,
    email: cleanedEmail,
    role,
    status: 'pending',
    invited_by: user.id,
    accepted_user_id: null,
  };

  const openInvite = (existingRows || []).find((row) => row.status === 'pending');
  if (openInvite) {
    const { data, error } = await supabase
      .from('academy_invitations')
      .update(payload)
      .eq('id', openInvite.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

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

// 직원이 본인 이메일로 받은 pending 초대 조회.
// SQL 027 RPC가 academies RLS를 넓히지 않고 학원 이름을 함께 반환한다.
// 아직 027을 적용하지 않은 환경에서는 기존 join 쿼리로 fallback한다.
export async function listMyPendingInvitations() {
  const user = await getCurrentUserOrThrow();
  const cleanedEmail = normalizeEmail(user.email);
  if (!cleanedEmail) return [];

  const { data: rpcData, error: rpcError } = await supabase
    .rpc('list_my_pending_academy_invitations');
  if (!rpcError) {
    return (rpcData || []).map((row) => ({
      id: row.invitation_id,
      academy_id: row.academy_id,
      email: row.email,
      role: row.role,
      status: row.status,
      invited_by: row.invited_by,
      accepted_user_id: row.accepted_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      academy: {
        id: row.academy_id,
        name: row.academy_name,
      },
    }));
  }

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
  assertStaffRole(role);
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


function isMissingAcademySettingsColumnError(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    error?.code === 'PGRST204' ||
    message.includes('academy_type') ||
    message.includes('academy_subjects') ||
    message.includes('clinic_required') ||
    message.includes('clinic_record_fields') ||
    message.includes('clinic_default_activity_type') ||
    message.includes('clinic_default_items') ||
    message.includes('tuition_policy') ||
    message.includes('tuition_rates') ||
    message.includes('tuition_policy_onboarded_at') ||
    message.includes('address') ||
    message.includes('phone') ||
    message.includes('academy_onboarded_at')
  );
}

function buildAcademySettingsPayload({
  academyType,
  academySubjects,
  clinicRequired,
  clinicDefaultItems,
  clinicRecordFields,
  clinicDefaultActivityType,
  tuitionPolicy,
  tuitionRates,
  address,
  phone,
} = {}) {
  const out = {};
  if (academyType !== undefined) out.academy_type = academyType || null;
  if (academySubjects !== undefined) out.academy_subjects = Array.isArray(academySubjects) ? academySubjects : [];
  if (clinicRequired !== undefined) out.clinic_required = clinicRequired !== false;
  if (clinicDefaultItems !== undefined) {
    out.clinic_default_items =
      clinicDefaultItems && typeof clinicDefaultItems === 'object' && !Array.isArray(clinicDefaultItems)
        ? clinicDefaultItems
        : {};
  }
  if (clinicRecordFields !== undefined) {
    out.clinic_record_fields = Array.isArray(clinicRecordFields) ? clinicRecordFields : [];
  }
  if (clinicDefaultActivityType !== undefined) {
    out.clinic_default_activity_type = clinicDefaultActivityType || 'clinic';
  }
  if (tuitionPolicy !== undefined) {
    out.tuition_policy = tuitionPolicy || 'school_level';
    out.tuition_policy_onboarded_at = new Date().toISOString();
  }
  if (tuitionRates !== undefined) {
    out.tuition_rates = tuitionRates && typeof tuitionRates === 'object'
      ? tuitionRates
      : {};
  }
  if (address !== undefined) out.address = (address || '').trim() || null;
  if (phone !== undefined) out.phone = (phone || '').trim() || null;
  out.academy_onboarded_at = new Date().toISOString();
  return out;
}

// 학원 생성 + 본인을 owner 멤버로 등록 (2-step).
// 진정한 원자성이 필요해지면 추후 SQL RPC로 옮길 예정.
export async function createAcademyAsOwner({
  name,
  academyType,
  academySubjects,
  clinicRequired,
  clinicDefaultItems,
  clinicRecordFields,
  clinicDefaultActivityType,
  tuitionPolicy,
  tuitionRates,
  address,
  phone,
} = {}) {
  const user = await getCurrentUserOrThrow();
  const trimmed = (name ?? '').trim();
  if (!trimmed) throw new Error('학원 이름을 입력해주세요.');

  // Step 1: academies row 생성
  const basePayload = { name: trimmed, owner_id: user.id };
  const settingsPayload = buildAcademySettingsPayload({
    academyType,
    academySubjects,
    clinicRequired,
    clinicDefaultItems,
    clinicRecordFields,
    clinicDefaultActivityType,
    tuitionPolicy,
    tuitionRates,
    address,
    phone,
  });
  let { data: academy, error: aErr } = await supabase
    .from('academies')
    .insert({ ...basePayload, ...settingsPayload })
    .select()
    .single();
  if (aErr && isMissingAcademySettingsColumnError(aErr)) {
    const missingColumnMessage = `${aErr?.message || ''} ${aErr?.details || ''}`.toLowerCase();
    if (missingColumnMessage.includes('clinic_default_items')) {
      throw new Error('클리닉 기본 구성 저장을 위해 SQL 038을 먼저 적용해주세요.');
    }
    if (missingColumnMessage.includes('tuition_rates')) {
      throw new Error('수강료 가격표 저장을 위해 SQL 033을 먼저 적용해주세요.');
    }
    const retry = await supabase
      .from('academies')
      .insert(basePayload)
      .select()
      .single();
    academy = retry.data;
    aErr = retry.error;
  }
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

export async function updateAcademyProfileSettings(academyId, patch = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const dbPatch = {};
  if (patch.name !== undefined) {
    const trimmed = (patch.name ?? '').trim();
    if (!trimmed) throw new Error('학원 이름을 입력해주세요.');
    dbPatch.name = trimmed;
  }
  if (patch.academyType !== undefined) dbPatch.academy_type = patch.academyType || null;
  if (patch.academySubjects !== undefined) dbPatch.academy_subjects = Array.isArray(patch.academySubjects) ? patch.academySubjects : [];
  if (patch.clinicRequired !== undefined) dbPatch.clinic_required = patch.clinicRequired !== false;
  if (patch.clinicDefaultItems !== undefined) {
    dbPatch.clinic_default_items =
      patch.clinicDefaultItems
      && typeof patch.clinicDefaultItems === 'object'
      && !Array.isArray(patch.clinicDefaultItems)
        ? patch.clinicDefaultItems
        : {};
  }
  if (patch.clinicRecordFields !== undefined) {
    dbPatch.clinic_record_fields = Array.isArray(patch.clinicRecordFields) ? patch.clinicRecordFields : [];
  }
  if (patch.clinicDefaultActivityType !== undefined) {
    dbPatch.clinic_default_activity_type = patch.clinicDefaultActivityType || 'clinic';
  }
  if (patch.tuitionPolicy !== undefined) {
    dbPatch.tuition_policy = patch.tuitionPolicy || 'school_level';
    dbPatch.tuition_policy_onboarded_at = new Date().toISOString();
  }
  if (patch.tuitionRates !== undefined) {
    dbPatch.tuition_rates = patch.tuitionRates && typeof patch.tuitionRates === 'object'
      ? patch.tuitionRates
      : {};
  }
  if (patch.address !== undefined) dbPatch.address = (patch.address || '').trim() || null;
  if (patch.phone !== undefined) dbPatch.phone = (patch.phone || '').trim() || null;
  if (patch.markOnboarded === true) dbPatch.academy_onboarded_at = new Date().toISOString();

  if (Object.keys(dbPatch).length === 0) return null;

  const runUpdate = async (payload) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    try {
      const result = await supabase
        .from('academies')
        .update(payload)
        .eq('id', academyId)
        .select()
        .abortSignal(controller.signal)
        .maybeSingle();
      if (controller.signal.aborted) {
        throw new Error('저장 시간이 초과됐어요. 네트워크를 확인하고 다시 시도해주세요.');
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        throw new Error('저장 시간이 초과됐어요. 네트워크를 확인하고 다시 시도해주세요.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let { data, error } = await runUpdate(dbPatch);
  if (error && isMissingAcademySettingsColumnError(error)) {
    if (dbPatch.clinic_default_items !== undefined) {
      throw new Error('클리닉 기본 구성 저장을 위해 SQL 038을 먼저 적용해주세요.');
    }
    if (dbPatch.address !== undefined || dbPatch.phone !== undefined) {
      throw new Error('학원 주소·전화번호 저장을 위해 SQL 031을 먼저 적용해주세요.');
    }
    if (dbPatch.tuition_rates !== undefined) {
      throw new Error('수강료 가격표 저장을 위해 SQL 033을 먼저 적용해주세요.');
    }
    if (dbPatch.tuition_policy !== undefined) {
      throw new Error('수강료 기준 저장을 위해 SQL 030을 먼저 적용해주세요.');
    }
    const fallback = {};
    if (dbPatch.name !== undefined) fallback.name = dbPatch.name;
    if (Object.keys(fallback).length === 0) return null;
    const retry = await runUpdate(fallback);
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  if (!data) {
    throw new Error('학원 원장 권한을 확인하지 못했어요. SQL 032를 적용한 뒤 다시 시도해주세요.');
  }
  return data;
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
  const { data: v2Data, error: v2Error } = await supabase.rpc('list_academy_member_profiles_v2', {
    p_academy_id: academyId,
  });
  if (!v2Error) return v2Data ?? [];

  const missingV2 = (v2Error.code || '').toLowerCase() === '42883'
    || String(v2Error.message || '').includes('list_academy_member_profiles_v2');
  if (!missingV2) throw v2Error;

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

// 초대를 수락해 역할 배정을 기다리는 직원 목록. SQL 026의 security definer
// RPC가 운영 권한을 검증하고, 필요한 프로필 정보만 반환한다.
export async function listAcademyRoleAssignmentCandidates(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase.rpc('list_academy_role_assignment_candidates', {
    p_academy_id: academyId,
  });
  if (error) throw error;
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
  if (rest.role && !['teacher', 'manager'].includes(rest.role)) {
    throw new Error('role 은 teacher 또는 manager 여야 해요.');
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

// 실제 앱 역할은 academy_members.role 이 source of truth다. 직원 프로필의
// role만 바꾸면 다음 로그인 때 이전 역할로 돌아가므로, 원장이 역할을 변경할 때는
// 두 테이블을 함께 갱신한다. RLS는 owner만 이 변경을 허용한다.
export async function updateAcademyMemberRole({ academyId, userId, role }) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!userId) throw new Error('userId가 필요해요.');
  assertStaffRole(role);
  const { data, error } = await supabase
    .from('academy_members')
    .update({ role })
    .eq('academy_id', academyId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// pending 직원에게 실제 역할을 부여하고 active 멤버십으로 전환한다.
// SQL 026 RPC가 owner/manager 권한과 "pending → 활성 역할" 전이를 검증한다.
export async function assignAcademyMemberRole({ academyId, userId, role }) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!userId) throw new Error('userId가 필요해요.');
  assertStaffRole(role);
  const { data, error } = await supabase.rpc('assign_academy_member_role', {
    p_academy_id: academyId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw new Error(error.message || '역할 배정에 실패했어요.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('역할 배정 결과가 없어요.');
  return row;
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


// ────────────────────────────────────────────────────────────────
// Phase 41 — 출결·등하원 설정 (academies columns)
// ────────────────────────────────────────────────────────────────

// SQL 027 — 직원은 직접 기록 또는 QR을 선택한다. wifi는 계속 지원하지 않는다.
const STAFF_CHECK_METHODS = new Set(['manual', 'qr']);
const STUDENT_CHECK_METHODS = new Set(['teacher_manual', 'qr', 'disabled']);

// SQL 011 의 새 컬럼을 한 번에 업데이트. owner 만 update RLS 통과.
// 전달된 키만 patch 한다 — undefined 는 무시.
export async function updateAcademyAttendanceSettings(academyId, patch = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const dbPatch = {};

  if (patch.staffCheckMethod !== undefined) {
    if (!STAFF_CHECK_METHODS.has(patch.staffCheckMethod)) {
      throw new Error("staff_check_method 는 'manual' 또는 'qr' 이어야 해요.");
    }
    dbPatch.staff_check_method = patch.staffCheckMethod;
  }
  if (patch.studentCheckMethod !== undefined) {
    if (!STUDENT_CHECK_METHODS.has(patch.studentCheckMethod)) {
      throw new Error("student_check_method 는 'teacher_manual', 'qr', 'disabled' 중 하나여야 해요.");
    }
    dbPatch.student_check_method = patch.studentCheckMethod;
  }
  if (patch.staffManualOverrideEnabled !== undefined) {
    dbPatch.staff_manual_override_enabled = !!patch.staffManualOverrideEnabled;
  }
  if (patch.studentManualOverrideEnabled !== undefined) {
    dbPatch.student_manual_override_enabled = !!patch.studentManualOverrideEnabled;
  }
  if (patch.attendanceQrToken !== undefined) {
    dbPatch.attendance_qr_token = patch.attendanceQrToken || null;
    dbPatch.attendance_qr_token_rotated_at = new Date().toISOString();
  }
  if (patch.markOnboarded === true) {
    dbPatch.attendance_onboarded_at = new Date().toISOString();
  }

  if (Object.keys(dbPatch).length === 0) return null;
  const { data, error } = await supabase
    .from('academies')
    .update(dbPatch)
    .eq('id', academyId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}


// ────────────────────────────────────────────────────────────────
// Phase 41 — 학생 등·하원 이벤트 (student_check_events)
// ────────────────────────────────────────────────────────────────

// 학원 단위 student_check_events 목록 조회 (read-only).
// 옵션:
//   - sinceDateYMD : 이 날짜(YYYY-MM-DD)의 한국 시간 하루만 조회
//   - limit        : 정렬 후 최대 N개 (없으면 1000)
function nextYmd(ymd) {
  const [year, month, day] = String(ymd).split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    next.getUTCFullYear(),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function currentAcademyYmd() {
  const parts = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function listStudentCheckEvents(academyId, {
  sinceDateYMD,
  studentId,
  limit = 1000,
} = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  let query = supabase
    .from('student_check_events')
    .select('*')
    .eq('academy_id', academyId)
    .order('event_time', { ascending: false });
  if (studentId) {
    query = query.eq('student_id', studentId);
  }
  if (sinceDateYMD) {
    const untilDateYMD = nextYmd(sinceDateYMD);
    query = query.gte('event_time', `${sinceDateYMD}T00:00:00+09:00`);
    if (untilDateYMD) {
      query = query.lt('event_time', `${untilDateYMD}T00:00:00+09:00`);
    }
  }
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createStudentCheckEvent({
  academyId, studentId, eventType, source = 'qr', sessionId, eventTime,
}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!studentId) throw new Error('studentId가 필요해요.');
  if (!['check_in', 'check_out'].includes(eventType)) {
    throw new Error("eventType 은 'check_in' 또는 'check_out' 이어야 해요.");
  }
  const user = await getCurrentUserOrThrow();
  const payload = {
    academy_id: academyId,
    student_id: studentId,
    event_type: eventType,
    source: source || 'qr',
    session_id: sessionId || null,
    created_by: user.id,
  };
  if (eventTime) payload.event_time = eventTime;
  const { data, error } = await supabase
    .from('student_check_events')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// SQL 035가 적용된 환경에서는 등원/하원 결정을 서버 transaction 안에서 처리한다.
// 아직 migration이 적용되지 않은 배포에는 null을 반환해 기존 안전 fallback을 쓴다.
export async function toggleStudentCheckEvent({
  academyId, studentId, source = 'qr',
}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!studentId) throw new Error('studentId가 필요해요.');
  const { data, error } = await supabase.rpc('toggle_student_check_event', {
    p_academy_id: academyId,
    p_student_id: studentId,
    p_source: source || 'qr',
  });
  if (error) {
    // PostgREST schema cache 또는 DB에서 함수가 아직 발견되지 않는 경우.
    if (error.code !== 'PGRST202' && error.code !== '42883') throw error;

    // SQL 035 적용 전 안전 fallback. 동시 단말 직렬화는 migration 적용 후 보장된다.
    const todayYmd = currentAcademyYmd();
    const events = await listStudentCheckEvents(academyId, {
      sinceDateYMD: todayYmd,
      limit: 1000,
    });
    const latest = events.find((event) => event.student_id === studentId) || null;
    const latestTime = latest?.event_time ? new Date(latest.event_time).getTime() : 0;
    if (latestTime && Date.now() - latestTime < 8000) {
      return { event: latest, duplicate: true };
    }
    const event = await createStudentCheckEvent({
      academyId,
      studentId,
      eventType: latest?.event_type === 'check_in' ? 'check_out' : 'check_in',
      source,
    });
    return { event, duplicate: false };
  }
  return data || null;
}

export async function publicStudentCheckin({ academyId, qrToken, pin, expiresAt } = {}) {
  assertSupabaseConfigured();
  const { data, error } = await supabase.rpc('public_student_checkin', {
    p_academy_id: academyId || null,
    p_qr_token: qrToken || '',
    p_pin: pin || '',
    p_expires_at: expiresAt ? Number(expiresAt) : null,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
