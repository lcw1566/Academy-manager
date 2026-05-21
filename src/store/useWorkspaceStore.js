// useWorkspaceStore
//
// Supabase workspace 상태 관리:
//   - profile (public.profiles row)
//   - memberships (public.academy_members + 학원 join)
//   - currentAcademyId (현재 선택된 학원, localStorage 영속)
//   - serverStudents (현재 학원의 서버 학생 목록 — read-only 미리보기)
//
// 로그인 직후 initializeWorkspace() 1회 호출.
// 로그아웃 시 clearWorkspace() 로 정리.
//
// ⚠ 이 store 는 useAcademyStore (localStorage 기반 도메인 데이터) 와 무관합니다.
//   현재 단계에서 서버 학생은 "fetch 동작 확인용 read-only" 로만 보관하고,
//   기존 학생 추가/수정/삭제 흐름은 그대로 localStorage 만 사용합니다.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  getProfile,
  upsertProfile,
  updateMyProfileAccountType,
  updateMyProfileBasic,
  getMyAcademyMemberships,
  createAcademyAsOwner,
  listMyPendingInvitations,
  acceptAcademyInvitation,
  listAcademyMemberProfiles,
  listAcademyStaffProfiles,
  upsertAcademyStaffProfile,
} from '../services/supabase/workspaceApi';
import {
  listAcademyStudents,
  listAcademyClassGroups,
  listAcademyClassSessions,
  listAcademyLessonRecords,
  listAcademyAttendanceRecords,
  listAcademyClinicRecords,
  listAcademyPayments,
  listAcademyPayrolls,
} from '../services/supabase/domainApi';
import useAuthStore from './useAuthStore';
import useAcademyStore from './useAcademyStore';

const initialState = {
  profile: null,
  memberships: [],
  currentAcademyId: null,
  isWorkspaceLoading: false,
  workspaceError: null,
  isWorkspaceReady: false,

  // 서버 학생 (read-only)
  serverStudents: [],
  isServerStudentsLoading: false,
  serverStudentsError: null,
  serverStudentsLoadedAt: null, // ISO string

  // 서버 반 (read-only)
  serverClassGroups: [],
  isServerClassGroupsLoading: false,
  serverClassGroupsError: null,
  serverClassGroupsLoadedAt: null,

  // 서버 수업 회차 (read-only)
  serverClassSessions: [],
  isServerClassSessionsLoading: false,
  serverClassSessionsError: null,
  serverClassSessionsLoadedAt: null,

  // 서버 수업 기록 (read-only)
  serverLessonRecords: [],
  isServerLessonRecordsLoading: false,
  serverLessonRecordsError: null,
  serverLessonRecordsLoadedAt: null,

  // 서버 출결 (read-only)
  serverAttendanceRecords: [],
  isServerAttendanceRecordsLoading: false,
  serverAttendanceRecordsError: null,
  serverAttendanceRecordsLoadedAt: null,

  // 서버 클리닉 기록 (read-only)
  serverClinicRecords: [],
  isServerClinicRecordsLoading: false,
  serverClinicRecordsError: null,
  serverClinicRecordsLoadedAt: null,

  // 서버 수납 기록 (read-only)
  serverPayments: [],
  isServerPaymentsLoading: false,
  serverPaymentsError: null,
  serverPaymentsLoadedAt: null,

  // 서버 급여 기록 (read-only)
  serverPayrolls: [],
  isServerPayrollsLoading: false,
  serverPayrollsError: null,
  serverPayrollsLoadedAt: null,

  // 받은 학원 초대 (강사/보조강사) — pending 목록만 보관
  myPendingInvitations: [],
  isMyPendingInvitationsLoading: false,
  myPendingInvitationsError: null,
  myPendingInvitationsLoadedAt: null,

  // Phase 20 — academy 멤버의 profile 정보 (RPC 조회). 원장에게만 의미 있는 값.
  academyMemberProfiles: [],
  isAcademyMemberProfilesLoading: false,
  academyMemberProfilesError: null,

  // Phase 20 — academy-specific staff settings
  academyStaffProfiles: [],
  isAcademyStaffProfilesLoading: false,
  academyStaffProfilesError: null,
};

const PENDING_ACCOUNT_TYPE_KEY = 'pending-account-type';

function readPendingAccountType() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem(PENDING_ACCOUNT_TYPE_KEY) || null;
  } catch {
    return null;
  }
}

function clearPendingAccountType() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);
  } catch {
    /* ignore */
  }
}

const useWorkspaceStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      clearWorkspaceError: () => set({ workspaceError: null }),

      clearWorkspace: () =>
        set({
          ...initialState,
          currentAcademyId: null,
        }),

      // 프로필 동기화 — 없으면 email 을 기본 display_name 으로 자동 생성.
      // sessionStorage 의 pending-account-type 이 있으면 프로필에 반영하고 삭제.
      // (회원가입 시 이메일 인증이 필요해 session 이 없는 경우 account_type 을
      //  바로 저장하지 못하는 케이스를 위해 sessionStorage 에 임시 보관해둠.)
      syncProfile: async () => {
        if (!isSupabaseConfigured) return null;
        try {
          const authUser = useAuthStore.getState().user;
          const pendingAccountType = readPendingAccountType();

          let profile = await getProfile();
          if (!profile) {
            profile = await upsertProfile({
              displayName: authUser?.email ?? null,
              accountType: pendingAccountType || undefined,
              defaultRole:
                pendingAccountType === 'tutor'
                  ? 'tutor'
                  : pendingAccountType === 'owner'
                  ? 'owner'
                  : pendingAccountType === 'staff'
                  ? 'teacher'
                  : undefined,
            });
            if (pendingAccountType) clearPendingAccountType();
          } else if (
            pendingAccountType &&
            (!profile.account_type || profile.account_type === 'tutor')
          ) {
            // 기존 profile 에 account_type 이 비어있거나 기본값(tutor) 이면 덮어쓴다.
            // 명시적으로 다른 값이 들어가 있는 경우는 보존.
            try {
              profile = await updateMyProfileAccountType({
                accountType: pendingAccountType,
              });
            } catch (err) {
              // 계정 유형 반영 실패는 치명적이지 않음 — 사용자가 더보기에서 다시 설정 가능
              console.warn('[syncProfile] account_type 반영 실패', err);
            }
            clearPendingAccountType();
          }
          set({ profile });
          return profile;
        } catch (err) {
          set({ workspaceError: err?.message ?? '프로필 동기화에 실패했어요.' });
          return null;
        }
      },

      // 프로필 기본 정보 수정 (display_name + phone)
      updateProfileBasic: async ({ displayName, phone } = {}) => {
        if (!isSupabaseConfigured) return null;
        try {
          const profile = await updateMyProfileBasic({ displayName, phone });
          set({ profile });
          return profile;
        } catch (err) {
          set({ workspaceError: err?.message ?? '프로필 저장에 실패했어요.' });
          throw err;
        }
      },

      // 프로필 account_type 수동 갱신 (더보기 UI 등에서 사용)
      setMyAccountType: async (accountType) => {
        if (!isSupabaseConfigured) return null;
        try {
          const profile = await updateMyProfileAccountType({ accountType });
          set({ profile });
          return profile;
        } catch (err) {
          set({ workspaceError: err?.message ?? '계정 유형 저장에 실패했어요.' });
          throw err;
        }
      },

      // 멤버십 목록 조회 + currentAcademyId 유효성 검증
      loadMemberships: async () => {
        if (!isSupabaseConfigured) return [];
        try {
          const memberships = await getMyAcademyMemberships();
          const ids = new Set(memberships.map((m) => m.academy_id));

          let currentAcademyId = get().currentAcademyId;
          if (!currentAcademyId || !ids.has(currentAcademyId)) {
            currentAcademyId = memberships[0]?.academy_id ?? null;
          }

          set({ memberships, currentAcademyId });
          return memberships;
        } catch (err) {
          set({
            workspaceError:
              err?.message ?? '학원 목록을 불러오지 못했어요.',
          });
          return [];
        }
      },

      // 학원 생성 → 멤버십 재조회 → 새 학원을 current로 지정 → 서버 데이터 재조회
      createAcademy: async ({ name }) => {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase가 설정되지 않았어요.');
        }
        set({ isWorkspaceLoading: true, workspaceError: null });
        try {
          const academy = await createAcademyAsOwner({ name });
          const memberships = await getMyAcademyMemberships();
          set({ memberships, currentAcademyId: academy.id });
          await Promise.all([
            get().loadServerStudents(),
            get().loadServerClassGroups(),
            get().loadServerClassSessions(),
            get().loadServerLessonRecords(),
            get().loadServerAttendanceRecords(),
            get().loadServerClinicRecords(),
            get().loadServerPayments(),
            get().loadServerPayrolls(),
            get().loadAcademyMemberProfiles(),
            get().loadAcademyStaffProfiles(),
          ]);
          return academy;
        } catch (err) {
          set({
            workspaceError: err?.message ?? '학원 생성에 실패했어요.',
          });
          throw err;
        } finally {
          set({ isWorkspaceLoading: false });
        }
      },

      setCurrentAcademyId: (academyId) => {
        const memberships = get().memberships;
        if (academyId && !memberships.some((m) => m.academy_id === academyId)) {
          return;
        }
        if (academyId === get().currentAcademyId) return;
        set({ currentAcademyId: academyId });
        // 학원 전환 시 서버 데이터 갱신
        get().loadServerStudents();
        get().loadServerClassGroups();
        get().loadServerClassSessions();
        get().loadServerLessonRecords();
        get().loadServerAttendanceRecords();
        get().loadServerClinicRecords();
        get().loadServerPayments();
        get().loadServerPayrolls();
        get().loadAcademyMemberProfiles();
        get().loadAcademyStaffProfiles();
      },

      // 서버 학생 목록 조회 (read-only). currentAcademyId 가 비어 있으면 빈 배열.
      loadServerStudents: async () => {
        if (!isSupabaseConfigured) {
          set({ serverStudents: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ serverStudents: [], serverStudentsError: null });
          return [];
        }
        set({ isServerStudentsLoading: true, serverStudentsError: null });
        try {
          const list = await listAcademyStudents(academyId);
          set({
            serverStudents: list,
            serverStudentsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          set({
            serverStudentsError:
              err?.message ?? '서버 학생을 불러오지 못했어요.',
          });
          return [];
        } finally {
          set({ isServerStudentsLoading: false });
        }
      },

      // 서버 반 목록 조회 (read-only). currentAcademyId 가 비어 있으면 빈 배열.
      loadServerClassGroups: async () => {
        if (!isSupabaseConfigured) {
          set({ serverClassGroups: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ serverClassGroups: [], serverClassGroupsError: null });
          return [];
        }
        set({ isServerClassGroupsLoading: true, serverClassGroupsError: null });
        try {
          const list = await listAcademyClassGroups(academyId);
          set({
            serverClassGroups: list,
            serverClassGroupsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          set({
            serverClassGroupsError:
              err?.message ?? '서버 반을 불러오지 못했어요.',
          });
          return [];
        } finally {
          set({ isServerClassGroupsLoading: false });
        }
      },

      // 서버 수업 회차 목록 조회 (read-only).
      loadServerClassSessions: async () => {
        if (!isSupabaseConfigured) {
          set({ serverClassSessions: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ serverClassSessions: [], serverClassSessionsError: null });
          return [];
        }
        set({ isServerClassSessionsLoading: true, serverClassSessionsError: null });
        try {
          const list = await listAcademyClassSessions(academyId);
          set({
            serverClassSessions: list,
            serverClassSessionsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          set({
            serverClassSessionsError:
              err?.message ?? '서버 수업 회차를 불러오지 못했어요.',
          });
          return [];
        } finally {
          set({ isServerClassSessionsLoading: false });
        }
      },

      // 서버 수업 기록 목록 조회 (read-only).
      loadServerLessonRecords: async () => {
        if (!isSupabaseConfigured) {
          set({ serverLessonRecords: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ serverLessonRecords: [], serverLessonRecordsError: null });
          return [];
        }
        set({ isServerLessonRecordsLoading: true, serverLessonRecordsError: null });
        try {
          const list = await listAcademyLessonRecords(academyId);
          set({
            serverLessonRecords: list,
            serverLessonRecordsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          set({
            serverLessonRecordsError:
              err?.message ?? '서버 수업 기록을 불러오지 못했어요.',
          });
          return [];
        } finally {
          set({ isServerLessonRecordsLoading: false });
        }
      },

      // 서버 급여 기록 목록 조회 (read-only).
      loadServerPayrolls: async () => {
        if (!isSupabaseConfigured) {
          set({ serverPayrolls: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ serverPayrolls: [], serverPayrollsError: null });
          return [];
        }
        set({ isServerPayrollsLoading: true, serverPayrollsError: null });
        try {
          const list = await listAcademyPayrolls(academyId);
          set({
            serverPayrolls: list,
            serverPayrollsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          set({
            serverPayrollsError:
              err?.message ?? '서버 급여 기록을 불러오지 못했어요.',
          });
          return [];
        } finally {
          set({ isServerPayrollsLoading: false });
        }
      },

      // 서버 수납 기록 목록 조회 (read-only).
      loadServerPayments: async () => {
        if (!isSupabaseConfigured) {
          set({ serverPayments: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ serverPayments: [], serverPaymentsError: null });
          return [];
        }
        set({ isServerPaymentsLoading: true, serverPaymentsError: null });
        try {
          const list = await listAcademyPayments(academyId);
          set({
            serverPayments: list,
            serverPaymentsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          set({
            serverPaymentsError:
              err?.message ?? '서버 수납 기록을 불러오지 못했어요.',
          });
          return [];
        } finally {
          set({ isServerPaymentsLoading: false });
        }
      },

      // 서버 클리닉 기록 목록 조회 (read-only).
      loadServerClinicRecords: async () => {
        if (!isSupabaseConfigured) {
          set({ serverClinicRecords: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ serverClinicRecords: [], serverClinicRecordsError: null });
          return [];
        }
        set({ isServerClinicRecordsLoading: true, serverClinicRecordsError: null });
        try {
          const list = await listAcademyClinicRecords(academyId);
          set({
            serverClinicRecords: list,
            serverClinicRecordsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          set({
            serverClinicRecordsError:
              err?.message ?? '서버 클리닉 기록을 불러오지 못했어요.',
          });
          return [];
        } finally {
          set({ isServerClinicRecordsLoading: false });
        }
      },

      // 서버 출결 목록 조회 (read-only).
      loadServerAttendanceRecords: async () => {
        if (!isSupabaseConfigured) {
          set({ serverAttendanceRecords: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ serverAttendanceRecords: [], serverAttendanceRecordsError: null });
          return [];
        }
        set({ isServerAttendanceRecordsLoading: true, serverAttendanceRecordsError: null });
        try {
          const list = await listAcademyAttendanceRecords(academyId);
          set({
            serverAttendanceRecords: list,
            serverAttendanceRecordsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          set({
            serverAttendanceRecordsError:
              err?.message ?? '서버 출결을 불러오지 못했어요.',
          });
          return [];
        } finally {
          set({ isServerAttendanceRecordsLoading: false });
        }
      },

      // 학원 멤버의 profile (이름/이메일/전화) 로드 — 원장만 결과를 받음.
      // RPC 결과가 빈 배열이면 권한이 없거나 마이그레이션 미적용. 에러로 처리하지 않음.
      // 성공 시 로컬 mirror 도 동기화 (staff_profiles 가 아직 로딩 전이면
      // skip 만 되고 다음 staff_profiles 로딩 후 다시 호출되므로 안전).
      loadAcademyMemberProfiles: async () => {
        if (!isSupabaseConfigured) {
          set({ academyMemberProfiles: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ academyMemberProfiles: [], academyMemberProfilesError: null });
          return [];
        }
        set({ isAcademyMemberProfilesLoading: true, academyMemberProfilesError: null });
        try {
          const list = await listAcademyMemberProfiles(academyId);
          set({ academyMemberProfiles: list });
          get().syncLocalStaffFromServerMembers();
          return list;
        } catch (err) {
          set({
            academyMemberProfilesError:
              err?.message ?? '학원 멤버 프로필을 불러오지 못했어요.',
          });
          return [];
        } finally {
          set({ isAcademyMemberProfilesLoading: false });
        }
      },

      // academy_staff_profiles 로드 — 원장 또는 본인 row 만 보임.
      // 성공 시 자동으로 로컬 강사/보조강사 mirror 동기화.
      loadAcademyStaffProfiles: async () => {
        if (!isSupabaseConfigured) {
          set({ academyStaffProfiles: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ academyStaffProfiles: [], academyStaffProfilesError: null });
          return [];
        }
        set({ isAcademyStaffProfilesLoading: true, academyStaffProfilesError: null });
        try {
          const list = await listAcademyStaffProfiles(academyId);
          set({ academyStaffProfiles: list });
          // member profiles + staff profiles 가 모두 있어야 의미가 있다.
          // 둘 중 어느 쪽이 먼저 끝나든 mirror 를 호출하면 다른 쪽이 아직
          // 비어 있어도 안전하게 무시되므로 양쪽 모두에서 호출한다.
          get().syncLocalStaffFromServerMembers();
          return list;
        } catch (err) {
          set({
            academyStaffProfilesError:
              err?.message ?? '학원 강사 설정을 불러오지 못했어요.',
          });
          return [];
        } finally {
          set({ isAcademyStaffProfilesLoading: false });
        }
      },

      // Owner 가 학원-특정 강사 설정 저장 → academy_staff_profiles upsert.
      // 성공 시 store cache + 로컬 강사/보조강사 mirror 도 갱신.
      saveAcademyStaffProfile: async ({ academyId, userId, ...rest } = {}) => {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase가 설정되지 않았어요.');
        }
        const aId = academyId || get().currentAcademyId;
        const saved = await upsertAcademyStaffProfile({ academyId: aId, userId, ...rest });
        // cache 갱신 (있으면 교체, 없으면 추가)
        set((s) => {
          const idx = s.academyStaffProfiles.findIndex(
            (p) => p.academy_id === saved.academy_id && p.user_id === saved.user_id,
          );
          if (idx >= 0) {
            const next = s.academyStaffProfiles.slice();
            next[idx] = saved;
            return { academyStaffProfiles: next };
          }
          return { academyStaffProfiles: [...s.academyStaffProfiles, saved] };
        });
        // Mirror this single change into local arrays so the existing
        // class-teacher selector + payroll generator can see it immediately.
        get().syncLocalStaffFromServerMembers();
        return saved;
      },

      // Mirror accepted academy members into the local academyTeachers /
      // academyAssistants arrays based on academy_staff_profiles role.
      //
      // We only mirror members that ALSO have an academy_staff_profiles row —
      // a freshly accepted invitation without owner-side configuration has
      // no role decided yet (teacher vs assistant), and the local arrays
      // are split by that exact distinction. Skipping silently keeps the
      // local arrays clean.
      //
      // Returns { mirrored, skipped } for diagnostics.
      syncLocalStaffFromServerMembers: () => {
        const memberProfiles = get().academyMemberProfiles || [];
        const staffProfiles = get().academyStaffProfiles || [];
        if (memberProfiles.length === 0) return { mirrored: 0, skipped: 0 };

        const academyState = useAcademyStore.getState();
        const upsertTeacher = academyState.upsertLocalTeacherFromServerStaff;
        const upsertAssistant = academyState.upsertLocalAssistantFromServerStaff;
        if (typeof upsertTeacher !== 'function' || typeof upsertAssistant !== 'function') {
          return { mirrored: 0, skipped: memberProfiles.length };
        }

        let mirrored = 0;
        let skipped = 0;

        memberProfiles.forEach((profile) => {
          const staff = staffProfiles.find((sp) => sp.user_id === profile.user_id);
          if (!staff || !staff.role) {
            // Accepted member but owner hasn't configured their academy
            // settings (no role decided yet). Skip — they'll show up via
            // AcademyStaffMembersSection until the owner picks teacher or
            // assistant in the modal.
            skipped += 1;
            return;
          }
          const payload = {
            userId: profile.user_id,
            memberId: staff.member_id || null,
            email: profile.email,
            displayName: profile.display_name,
            phone: profile.phone,
            subject: staff.subject,
            subjects: staff.subjects,
            wageType: staff.wage_type,
            hourlyWage: staff.hourly_wage,
            monthlySalary: staff.monthly_salary,
            memo: staff.memo,
            status: staff.status,
          };
          if (staff.role === 'teacher') {
            upsertTeacher(payload);
            mirrored += 1;
          } else if (staff.role === 'assistant') {
            upsertAssistant(payload);
            mirrored += 1;
          } else {
            skipped += 1;
          }
        });
        return { mirrored, skipped };
      },

      // 받은 학원 초대 목록 (pending 만) 조회
      loadMyPendingInvitations: async () => {
        if (!isSupabaseConfigured) {
          set({ myPendingInvitations: [] });
          return [];
        }
        set({ isMyPendingInvitationsLoading: true, myPendingInvitationsError: null });
        try {
          const list = await listMyPendingInvitations();
          set({
            myPendingInvitations: list,
            myPendingInvitationsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          set({
            myPendingInvitationsError: err?.message ?? '받은 초대를 불러오지 못했어요.',
          });
          return [];
        } finally {
          set({ isMyPendingInvitationsLoading: false });
        }
      },

      // 초대 수락 → academy_members 생성 → 멤버십 reload → 새 학원을 current 로 지정
      // 도메인 서버 데이터도 새로 fetch.
      acceptInvitation: async (invitationId) => {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase가 설정되지 않았어요.');
        }
        const result = await acceptAcademyInvitation(invitationId);
        const memberships = await getMyAcademyMemberships();
        set({ memberships, currentAcademyId: result.academyId });
        // 받은 초대 목록 갱신 (방금 수락한 건은 pending 에서 빠짐)
        await get().loadMyPendingInvitations();
        // 새 학원의 도메인 데이터 fetch (정원장 케이스와 동일)
        await Promise.all([
          get().loadServerStudents(),
          get().loadServerClassGroups(),
          get().loadServerClassSessions(),
          get().loadServerLessonRecords(),
          get().loadServerAttendanceRecords(),
          get().loadServerClinicRecords(),
          get().loadServerPayments(),
          get().loadServerPayrolls(),
          get().loadAcademyMemberProfiles(),
          get().loadAcademyStaffProfiles(),
        ]);
        return result;
      },

      // 로그인 직후 호출: 모든 서버 데이터 일괄 동기화
      initializeWorkspace: async () => {
        if (!isSupabaseConfigured) return;
        set({ isWorkspaceLoading: true, workspaceError: null });
        try {
          await get().syncProfile();
          await get().loadMemberships();
          await Promise.all([
            get().loadServerStudents(),
            get().loadServerClassGroups(),
            get().loadServerClassSessions(),
            get().loadServerLessonRecords(),
            get().loadServerAttendanceRecords(),
            get().loadServerClinicRecords(),
            get().loadServerPayments(),
            get().loadServerPayrolls(),
            get().loadMyPendingInvitations(),
            get().loadAcademyMemberProfiles(),
            get().loadAcademyStaffProfiles(),
          ]);
          set({ isWorkspaceReady: true });
        } finally {
          set({ isWorkspaceLoading: false });
        }
      },
    }),
    {
      name: 'academy-manager-workspace',
      storage: createJSONStorage(() => localStorage),
      // currentAcademyId 만 영속화. 나머지는 매 세션 새로 fetch.
      partialize: (state) => ({ currentAcademyId: state.currentAcademyId }),
    }
  )
);

export default useWorkspaceStore;
