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
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  getProfile,
  upsertProfile,
  updateMyProfileAccountType,
  updateMyProfileBasic,
  getMyAcademyMemberships,
  createAcademyAsOwner,
  updateAcademyProfileSettings,
  listMyPendingInvitations,
  acceptAcademyInvitation,
  listAcademyInvitations,
  cancelAcademyInvitation,
  listAcademyMemberProfiles,
  listAcademyStaffProfiles,
  upsertAcademyStaffProfile,
  updateAcademyAttendanceSettings,
  listStudentCheckEvents,
  createStudentCheckEvent,
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
  listAcademyStaffShifts,
} from '../services/supabase/domainApi';
// Phase 44.5 / Phase A — 룰 기반 스케줄 read-only 로더.
// Phase 44.7 / Phase C — staff_attendance_logs 와 class_session_exceptions CUD 추가.
import {
  listStaffWorkRules,
  listStaffWorkExceptions,
  createStaffWorkException,
  updateStaffWorkException,
  deleteStaffWorkException,
  listClassScheduleRules,
  listClassSessionExceptions,
  listStaffAttendanceLogs,
  createStaffAttendanceLog,
  updateStaffAttendanceLog,
  createClassSessionException,
} from '../services/supabase/scheduleRulesApi';
import useAuthStore from './useAuthStore';
import useAcademyStore from './useAcademyStore';

// Phase 32 — 학원 선택 picked 여부. sessionStorage 에도 동기화하지만 React 가
// 변화를 감지할 수 있도록 store state 로도 관리한다. WorkspaceSelectionPage 의
// markWorkspacePicked() 가 이 값을 true 로 set 하고, App.jsx 가 subscribe.
const WORKSPACE_PICKED_SESSION_KEY = 'workspace-picked';
const LEGACY_WORKSPACE_STORAGE_KEY = 'academy-manager-workspace';
const WORKSPACE_STORAGE_KEY = 'seenit-workspace';

function ensureCurrentAcademyDataScope(academyId) {
  const userId = useAuthStore.getState().user?.id;
  if (!userId || !academyId) return;
  useAcademyStore.getState().ensureAcademyDataScope?.(userId, academyId);
}

function syncAcademyProfileFromServer(academy) {
  if (!academy) return;
  const localProfile = useAcademyStore.getState().academyProfile || {};
  useAcademyStore.getState().setAcademyProfile?.({
    name: academy.name || '우리 학원',
    academyType: academy.academy_type || 'core_subjects',
    academySubjects: Array.isArray(academy.academy_subjects)
      ? academy.academy_subjects
      : ['korean', 'english', 'math'],
    clinicRequired: academy.clinic_required !== false,
    tuitionPolicy: academy.tuition_policy || 'class',
    address: academy.address ?? localProfile.address ?? '',
    phone: academy.phone ?? localProfile.phone ?? '',
  });
}

function isCurrentAcademy(get, academyId) {
  return get().currentAcademyId === academyId;
}

function migrateWorkspaceStorageKey() {
  if (typeof localStorage === 'undefined') return;
  try {
    const nextValue = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    const legacyValue = localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
    if (!nextValue && legacyValue) {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, legacyValue);
    }
  } catch {
    /* ignore */
  }
}

migrateWorkspaceStorageKey();

function readInitialWorkspacePicked() {
  if (typeof sessionStorage === 'undefined') return false;
  try { return sessionStorage.getItem(WORKSPACE_PICKED_SESSION_KEY) === '1'; }
  catch { return false; }
}

const initialState = {
  profile: null,
  memberships: [],
  currentAcademyId: null,
  isWorkspaceLoading: false,
  workspaceError: null,
  isWorkspaceReady: false,
  // Phase 32 — 학원 선택 화면 통과 여부 (reactive).
  workspacePicked: readInitialWorkspacePicked(),

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

  // Phase 29 — 원장이 보낸 학원 초대 목록 (pending / accepted / canceled 모두).
  // 구성원 관리 섹션에서 pending 만 추려 보여준다.
  academyInvitations: [],
  isAcademyInvitationsLoading: false,
  academyInvitationsError: null,

  // Phase 31 — 학원 staff 근무표 (SQL 006 academy_staff_shifts). owner 는 전체,
  // staff 는 본인 row 만 RLS 가 노출. 로컬 store(academyStaffShifts) 와 sync.
  serverStaffShifts: [],
  isServerStaffShiftsLoading: false,
  serverStaffShiftsError: null,
  serverStaffShiftsLoadedAt: null,

  // Phase 41 — 학생 등·하원 이벤트 (SQL 011 student_check_events).
  studentCheckEvents: [],
  isStudentCheckEventsLoading: false,
  studentCheckEventsError: null,
  studentCheckEventsLoadedAt: null,

  // Phase 44.5 / Phase A — 룰 기반 스케줄 모델 (SQL 014).
  // 모두 read-only 미리보기. Phase B 에서 ClassGroupFormModal / ShiftFormModal
  // 가 룰을 INSERT 하기 시작하면 본격적으로 채워진다. 현재는 빈 배열.
  staffWorkRules: [],
  isStaffWorkRulesLoading: false,
  staffWorkRulesError: null,
  staffWorkRulesLoadedAt: null,

  staffWorkExceptions: [],
  isStaffWorkExceptionsLoading: false,
  staffWorkExceptionsError: null,
  staffWorkExceptionsLoadedAt: null,

  // Phase C 에서 본격 사용. 정의만 보유.
  staffAttendanceLogs: [],
  isStaffAttendanceLogsLoading: false,
  staffAttendanceLogsError: null,
  staffAttendanceLogsLoadedAt: null,

  classScheduleRules: [],
  isClassScheduleRulesLoading: false,
  classScheduleRulesError: null,
  classScheduleRulesLoadedAt: null,

  classSessionExceptions: [],
  isClassSessionExceptionsLoading: false,
  classSessionExceptionsError: null,
  classSessionExceptionsLoadedAt: null,

  // Realtime subscription/runtime handles. partialize() excludes these from
  // localStorage, so they only live for the current browser session.
  workspaceRealtimeChannel: null,
  workspaceRealtimeRefreshTimer: null,
};

const PENDING_ACCOUNT_TYPE_KEY = 'pending-account-type';
const PENDING_PROFILE_KEY = 'pending-profile-info';

// 회원가입 시 AuthPage 가 localStorage 에 저장한 정보를, 이메일 인증 후 첫
// 로그인 시 syncProfile 에서 한 번 소비한다. localStorage 인 이유:
//   - 이메일 인증 링크가 새 탭에서 열려도 sessionStorage 와 달리 보존됨.
function readPendingAccountType() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(PENDING_ACCOUNT_TYPE_KEY) || null;
  } catch {
    return null;
  }
}

function clearPendingAccountType() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);
  } catch {
    /* ignore */
  }
}

// Pre-Phase 31 — display_name / phone 도 같은 패턴으로 보관/소비.
function readPendingProfileInfo() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearPendingProfileInfo() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

const useWorkspaceStore = create(
  persist(
    (set, get) => ({
      ...initialState,

      clearWorkspaceError: () => set({ workspaceError: null }),

      clearWorkspace: () => {
        get().stopWorkspaceRealtime?.();
        set({
          ...initialState,
          currentAcademyId: null,
          workspacePicked: false,
        });
      },

      stopWorkspaceRealtime: () => {
        const channel = get().workspaceRealtimeChannel;
        const timer = get().workspaceRealtimeRefreshTimer;
        if (timer) clearTimeout(timer);
        if (channel && supabase) {
          supabase.removeChannel(channel);
        }
        set({
          workspaceRealtimeChannel: null,
          workspaceRealtimeRefreshTimer: null,
        });
      },

      scheduleWorkspaceRealtimeRefresh: (reason = 'realtime') => {
        const prevTimer = get().workspaceRealtimeRefreshTimer;
        if (prevTimer) clearTimeout(prevTimer);
        const timer = setTimeout(async () => {
          set({ workspaceRealtimeRefreshTimer: null });
          try {
            await get().refreshWorkspaceCollaborationState({ reason });
            if (reason === 'staff_attendance_logs' && useAcademyStore.getState().role === 'owner') {
              useAcademyStore.getState().showToast?.('직원 근퇴 기록이 업데이트됐어요.');
            }
          } catch (err) {
            console.warn('[workspace realtime] refresh failed', reason, err);
          }
        }, 250);
        set({ workspaceRealtimeRefreshTimer: timer });
      },

      refreshWorkspaceCollaborationState: async () => {
        if (!isSupabaseConfigured) return;
        try {
          await Promise.all([
            get().loadMemberships(),
            get().loadMyPendingInvitations(),
          ]);

          if (get().currentAcademyId) {
            const refreshAcademyId = get().currentAcademyId;
            const academyStore = useAcademyStore.getState();
            const hydrateSnapshot = academyStore.hydrateAcademyFromServerSnapshot;

            await Promise.all([
              get().loadAcademyMemberProfiles(),
              get().loadAcademyStaffProfiles(),
              get().loadAcademyInvitations(),
            ]);
            get().syncLocalStaffFromServerMembers();

            const [
              students,
              classGroups,
              classSessions,
              lessonRecords,
              attendanceRecords,
              clinicRecords,
              payments,
              payrolls,
            ] = await Promise.all([
              get().loadServerStudents(),
              get().loadServerClassGroups(),
              get().loadServerClassSessions(),
              get().loadServerLessonRecords(),
              get().loadServerAttendanceRecords(),
              get().loadServerClinicRecords(),
              get().loadServerPayments(),
              get().loadServerPayrolls(),
            ]);

            if (get().currentAcademyId !== refreshAcademyId) return;
            if (typeof hydrateSnapshot === 'function') {
              hydrateSnapshot(
                {
                  students,
                  classGroups,
                  classSessions,
                  lessonRecords,
                  attendanceRecords,
                  clinicRecords,
                  payments,
                  payrolls,
                },
                {
                  strategy: 'serverWins',
                  // 권한이 회수된 직원 기기에 과거 캐시가 남지 않게 owner만
                  // local-only 항목을 보존한다.
                  preserveLocalOnly: academyStore.role === 'owner',
                },
              );
            }

            await Promise.all([
              get().loadServerStaffShifts(),
              get().loadStudentCheckEvents(),
              get().loadStaffWorkRules(),
              get().loadStaffWorkExceptions(),
              get().loadClassScheduleRules(),
              get().loadClassSessionExceptions(),
              get().loadStaffAttendanceLogs({ limit: 200 }),
            ]);
          }
        } catch (err) {
          console.warn('[workspace realtime] collaboration refresh failed', err);
        }
      },

      startWorkspaceRealtime: () => {
        if (!isSupabaseConfigured || !supabase) return;
        const authUser = useAuthStore.getState().user;
        if (!authUser?.id) return;

        get().stopWorkspaceRealtime?.();

        const academyId = get().currentAcademyId || 'none';
        const channel = supabase
          .channel(`workspace-collaboration:${authUser.id}:${academyId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'academy_invitations' },
            () => get().scheduleWorkspaceRealtimeRefresh('academy_invitations'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'academy_members' },
            () => get().scheduleWorkspaceRealtimeRefresh('academy_members'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'academy_staff_profiles' },
            () => get().scheduleWorkspaceRealtimeRefresh('academy_staff_profiles'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'academy_staff_work_rules' },
            () => get().scheduleWorkspaceRealtimeRefresh('academy_staff_work_rules'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'academy_staff_work_exceptions' },
            () => get().scheduleWorkspaceRealtimeRefresh('academy_staff_work_exceptions'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'students' },
            () => get().scheduleWorkspaceRealtimeRefresh('students'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'class_groups' },
            () => get().scheduleWorkspaceRealtimeRefresh('class_groups'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'class_sessions' },
            () => get().scheduleWorkspaceRealtimeRefresh('class_sessions'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'lesson_records' },
            () => get().scheduleWorkspaceRealtimeRefresh('lesson_records'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'attendance_records' },
            () => get().scheduleWorkspaceRealtimeRefresh('attendance_records'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'clinic_records' },
            () => get().scheduleWorkspaceRealtimeRefresh('clinic_records'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'payments' },
            () => get().scheduleWorkspaceRealtimeRefresh('payments'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'payrolls' },
            () => get().scheduleWorkspaceRealtimeRefresh('payrolls'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'academy_staff_shifts' },
            () => get().scheduleWorkspaceRealtimeRefresh('academy_staff_shifts'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'student_check_events' },
            () => get().scheduleWorkspaceRealtimeRefresh('student_check_events'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'class_schedule_rules' },
            () => get().scheduleWorkspaceRealtimeRefresh('class_schedule_rules'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'class_session_exceptions' },
            () => get().scheduleWorkspaceRealtimeRefresh('class_session_exceptions'),
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'staff_attendance_logs' },
            () => get().scheduleWorkspaceRealtimeRefresh('staff_attendance_logs'),
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'profiles',
              filter: `id=eq.${authUser.id}`,
            },
            () => get().scheduleWorkspaceRealtimeRefresh('profiles'),
          );

        set({ workspaceRealtimeChannel: channel });
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            get().scheduleWorkspaceRealtimeRefresh('realtime-subscribed');
          }
        });
      },

      // Phase 32 — 학원 선택 picked 토글. sessionStorage 도 함께 동기화.
      setWorkspacePicked: (picked) => {
        if (typeof sessionStorage !== 'undefined') {
          try {
            if (picked) sessionStorage.setItem(WORKSPACE_PICKED_SESSION_KEY, '1');
            else sessionStorage.removeItem(WORKSPACE_PICKED_SESSION_KEY);
          } catch { /* ignore */ }
        }
        set({ workspacePicked: !!picked });
      },

      // 프로필 동기화 — 없으면 email 을 기본 display_name 으로 자동 생성.
      // sessionStorage 의 pending-account-type 이 있으면 프로필에 반영하고 삭제.
      // (회원가입 시 이메일 인증이 필요해 session 이 없는 경우 account_type 을
      //  바로 저장하지 못하는 케이스를 위해 sessionStorage 에 임시 보관해둠.)
      syncProfile: async () => {
        if (!isSupabaseConfigured) return null;
        try {
          const authUser = useAuthStore.getState().user;
          const pendingAccountType = readPendingAccountType();
          const pendingProfile = readPendingProfileInfo();
          const pendingDisplayName = (pendingProfile?.displayName || '').trim() || null;
          const pendingPhone = (pendingProfile?.phone || '').trim() || null;

          let profile = await getProfile();
          if (!profile) {
            // pendingAccountType 이 없으면 account_type 을 명시적 null 로 저장한다.
            // (undefined 로 넘기면 upsertProfile 가 컬럼을 생략 → DB default 'tutor'
            //  가 박혀버려서 owner 로 가입한 사용자가 tutor 로 등록되는 버그가 있었음.)
            // display_name / phone 도 pending 값을 우선 사용. 없으면 email 을 fallback.
            profile = await upsertProfile({
              displayName: pendingDisplayName || authUser?.email || null,
              phone: pendingPhone ?? undefined,
              accountType: pendingAccountType ?? null,
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
            if (pendingProfile) clearPendingProfileInfo();
          } else if (pendingAccountType && !profile.account_type) {
            // 기존 profile 에 account_type 이 NULL 일 때만 pending 으로 덮어쓴다.
            // (이전에는 'tutor' default 도 덮어썼지만, 신규 가입은 이제 null 로
            //  명시 저장되므로 이 경로로 옴. 'tutor' 등 명시값은 항상 보존해서
            //  stale pending 으로 진짜 tutor 가 owner 로 바뀌는 사고를 막는다.)
            try {
              profile = await updateMyProfileAccountType({
                accountType: pendingAccountType,
              });
            } catch (err) {
              // 계정 유형 반영 실패는 치명적이지 않음 — 사용자가 더보기에서 다시 설정 가능
              console.warn('[syncProfile] account_type 반영 실패', err);
            }
            clearPendingAccountType();
          } else if (pendingAccountType) {
            // 명시값이 이미 있는데 stale pending 이 남아있는 경우 — 보존하고 정리만.
            clearPendingAccountType();
          }
          // Pre-Phase 31 — 기존 profile 에 display_name 이 비어있거나 email 그대로면
          // pending 의 displayName/phone 으로 보강. 명시적 값은 보존.
          if (profile && pendingProfile) {
            const needsName =
              !profile.display_name || profile.display_name === authUser?.email;
            const needsPhone = !profile.phone;
            if ((needsName && pendingDisplayName) || (needsPhone && pendingPhone)) {
              try {
                profile = await updateMyProfileBasic({
                  displayName: needsName && pendingDisplayName ? pendingDisplayName : undefined,
                  phone: needsPhone && pendingPhone ? pendingPhone : undefined,
                });
              } catch (err) {
                console.warn('[syncProfile] display_name/phone 보강 실패', err);
              }
            }
            clearPendingProfileInfo();
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

          ensureCurrentAcademyDataScope(currentAcademyId);
          syncAcademyProfileFromServer(
            memberships.find((membership) => membership.academy_id === currentAcademyId)?.academy,
          );
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
      createAcademy: async ({
        name,
        academyType,
        academySubjects,
        clinicRequired,
        tuitionPolicy,
      } = {}) => {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase가 설정되지 않았어요.');
        }
        set({ isWorkspaceLoading: true, workspaceError: null });
        try {
          const academy = await createAcademyAsOwner({
            name,
            academyType,
            academySubjects,
            clinicRequired,
            tuitionPolicy,
          });
          const memberships = await getMyAcademyMemberships();
          ensureCurrentAcademyDataScope(academy.id);
          syncAcademyProfileFromServer(academy);
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
            get().loadAcademyInvitations(),
            get().loadServerStaffShifts(),
            get().loadStaffAttendanceLogs({ limit: 200 }),
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

      updateAcademyProfileSettings: async (patch = {}) => {
        if (!isSupabaseConfigured) return null;
        const academyId = get().currentAcademyId;
        if (!academyId) throw new Error('학원을 먼저 선택해주세요.');
        try {
          const updated = await updateAcademyProfileSettings(academyId, {
            ...patch,
            markOnboarded: true,
          });
          if (updated) {
            set((s) => ({
              memberships: (s.memberships || []).map((m) =>
                m.academy_id === academyId
                  ? { ...m, academy: { ...(m.academy || {}), ...updated } }
                  : m
              ),
            }));
          }
          return updated;
        } catch (err) {
          set({ workspaceError: err?.message ?? '학원 설정 저장에 실패했어요.' });
          throw err;
        }
      },

      setCurrentAcademyId: (academyId) => {
        const memberships = get().memberships;
        if (academyId && !memberships.some((m) => m.academy_id === academyId)) {
          return;
        }
        if (academyId === get().currentAcademyId) return;
        ensureCurrentAcademyDataScope(academyId);
        syncAcademyProfileFromServer(
          memberships.find((membership) => membership.academy_id === academyId)?.academy,
        );
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
        get().loadAcademyInvitations();
        get().loadServerStaffShifts();
        get().loadStaffAttendanceLogs({ limit: 200 });
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
          if (!isCurrentAcademy(get, academyId)) return list;
          set({
            serverStudents: list,
            serverStudentsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            serverStudentsError:
              err?.message ?? '서버 학생을 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isServerStudentsLoading: false });
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
          if (!isCurrentAcademy(get, academyId)) return list;
          set({
            serverClassGroups: list,
            serverClassGroupsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            serverClassGroupsError:
              err?.message ?? '서버 반을 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isServerClassGroupsLoading: false });
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
          if (!isCurrentAcademy(get, academyId)) return list;
          set({
            serverClassSessions: list,
            serverClassSessionsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            serverClassSessionsError:
              err?.message ?? '서버 수업 회차를 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isServerClassSessionsLoading: false });
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
          if (!isCurrentAcademy(get, academyId)) return list;
          set({
            serverLessonRecords: list,
            serverLessonRecordsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            serverLessonRecordsError:
              err?.message ?? '서버 수업 기록을 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isServerLessonRecordsLoading: false });
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
          if (!isCurrentAcademy(get, academyId)) return list;
          set({
            serverPayrolls: list,
            serverPayrollsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            serverPayrollsError:
              err?.message ?? '서버 급여 기록을 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isServerPayrollsLoading: false });
        }
      },

      // Phase 31 — 서버 staff shifts 목록.
      // RLS 가 owner 는 전체, staff 는 본인 row 만 통과시키므로 호출자에 따라 결과 차이.
      // 로드 직후 local academyStaffShifts 에 mirror.
      loadServerStaffShifts: async () => {
        if (!isSupabaseConfigured) {
          set({ serverStaffShifts: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ serverStaffShifts: [], serverStaffShiftsError: null });
          return [];
        }
        set({ isServerStaffShiftsLoading: true, serverStaffShiftsError: null });
        try {
          const list = await listAcademyStaffShifts(academyId);
          if (!isCurrentAcademy(get, academyId)) return list;
          set({
            serverStaffShifts: list,
            serverStaffShiftsLoadedAt: new Date().toISOString(),
          });
          // local mirror — academy store 의 academyStaffShifts 에도 반영.
          const mirror = useAcademyStore.getState().mirrorServerStaffShifts;
          if (typeof mirror === 'function') mirror(list);
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            serverStaffShiftsError: err?.message ?? '근무표를 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isServerStaffShiftsLoading: false });
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
          if (!isCurrentAcademy(get, academyId)) return list;
          set({
            serverPayments: list,
            serverPaymentsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            serverPaymentsError:
              err?.message ?? '서버 수납 기록을 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isServerPaymentsLoading: false });
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
          if (!isCurrentAcademy(get, academyId)) return list;
          set({
            serverClinicRecords: list,
            serverClinicRecordsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            serverClinicRecordsError:
              err?.message ?? '서버 클리닉 기록을 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isServerClinicRecordsLoading: false });
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
          if (!isCurrentAcademy(get, academyId)) return list;
          set({
            serverAttendanceRecords: list,
            serverAttendanceRecordsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            serverAttendanceRecordsError:
              err?.message ?? '서버 출결을 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isServerAttendanceRecordsLoading: false });
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
          if (!isCurrentAcademy(get, academyId)) return list;
          set({ academyMemberProfiles: list });
          get().syncLocalStaffFromServerMembers();
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            academyMemberProfilesError:
              err?.message ?? '학원 멤버 프로필을 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isAcademyMemberProfilesLoading: false });
        }
      },

      // Phase 29 — 원장이 자기 학원의 모든 초대(pending/accepted/canceled) 목록을 조회.
      // 구성원 관리 섹션에서 pending 항목만 추려 표시한다. RLS 가 owner 만 통과시키므로
      // staff 가 호출하면 RLS 가 빈 결과를 줄 뿐 에러는 나지 않는다.
      loadAcademyInvitations: async () => {
        if (!isSupabaseConfigured) {
          set({ academyInvitations: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ academyInvitations: [], academyInvitationsError: null });
          return [];
        }
        set({ isAcademyInvitationsLoading: true, academyInvitationsError: null });
        try {
          const list = await listAcademyInvitations(academyId);
          if (!isCurrentAcademy(get, academyId)) return list;
          set({ academyInvitations: list });
          // Hotfix — invitation 캐시가 갱신되면 sync 를 한 번 더 돌려서
          // staff_profile 미설정 멤버도 invitation.role 로 mirror 가능하도록.
          try { get().syncLocalStaffFromServerMembers(); } catch { /* ignore */ }
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            academyInvitationsError: err?.message ?? '학원 초대 목록을 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isAcademyInvitationsLoading: false });
        }
      },

      // Phase 33 — invitation 을 로컬 캐시에 즉시 upsert. 새 row 면 prepend,
      // 같은 id 가 있으면 patch. createAcademyInvitation 직후 호출하면 UI 가
      // 즉시 반영된다 (full loadAcademyInvitations 재호출 불필요).
      upsertAcademyInvitationLocal: (inv) => {
        if (!inv?.id) return;
        set((s) => {
          const existing = s.academyInvitations || [];
          const idx = existing.findIndex((x) => x.id === inv.id);
          if (idx >= 0) {
            const next = existing.slice();
            next[idx] = { ...next[idx], ...inv };
            return { academyInvitations: next };
          }
          // 최신이 위로 오도록 prepend
          return { academyInvitations: [inv, ...existing] };
        });
      },

      // Phase 29 — 원장이 보낸 초대를 취소. 성공하면 캐시도 갱신.
      cancelAcademyInvitationById: async (invitationId) => {
        if (!isSupabaseConfigured || !invitationId) return null;
        try {
          const saved = await cancelAcademyInvitation(invitationId);
          set((s) => ({
            academyInvitations: s.academyInvitations.map((inv) =>
              inv.id === invitationId ? { ...inv, ...saved } : inv,
            ),
          }));
          return saved;
        } catch (err) {
          set({ academyInvitationsError: err?.message ?? '초대 취소에 실패했어요.' });
          throw err;
        }
      },

      // academy_staff_profiles 로드 — 원장/운영 매니저 또는 본인 row 만 보임.
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
          if (!isCurrentAcademy(get, academyId)) return list;
          set({ academyStaffProfiles: list });
          // member profiles + staff profiles 가 모두 있어야 의미가 있다.
          // 둘 중 어느 쪽이 먼저 끝나든 mirror 를 호출하면 다른 쪽이 아직
          // 비어 있어도 안전하게 무시되므로 양쪽 모두에서 호출한다.
          get().syncLocalStaffFromServerMembers();
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            academyStaffProfilesError:
              err?.message ?? '학원 강사 설정을 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isAcademyStaffProfilesLoading: false });
        }
      },

      // 원장 또는 권한 있는 운영 매니저가 학원-특정 직원 설정 저장 → upsert.
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

      // Mirror accepted academy members into local staff arrays based on role.
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
        // Hotfix (2026-06) — staff_profile 이 비어 있는 신규 수락자도
        // invitation.role 을 fallback 으로 사용해 스태프 탭에 노출.
        const academyInvitations = get().academyInvitations || [];
        if (memberProfiles.length === 0) return { mirrored: 0, skipped: 0 };

        const academyState = useAcademyStore.getState();
        const upsertTeacher = academyState.upsertLocalTeacherFromServerStaff;
        const upsertAssistant = academyState.upsertLocalAssistantFromServerStaff;
        const upsertManager = academyState.upsertLocalManagerFromServerStaff;
        const reconcileShiftLocalIds = academyState.reconcileStaffShiftLocalIds;
        if (typeof upsertTeacher !== 'function' || typeof upsertAssistant !== 'function' || typeof upsertManager !== 'function') {
          return { mirrored: 0, skipped: memberProfiles.length };
        }

        let mirrored = 0;
        let skipped = 0;

        memberProfiles.forEach((profile) => {
          const staff = staffProfiles.find((sp) => sp.user_id === profile.user_id);
          // Phase 1 — staff_profile.role 우선.
          let role = staff?.role || null;
          // Phase 2 (hotfix) — staff_profile 이 없거나 role 이 비어 있으면
          // academy_invitations 의 role 로 fallback. cancel 된 초대는 제외.
          if (!role && profile.email) {
            const target = (profile.email || '').toLowerCase();
            const inv = academyInvitations.find(
              (i) => i.role
                && (i.email || '').toLowerCase() === target
                && i.status !== 'canceled',
            );
            if (inv?.role) role = inv.role;
          }
          if (!role) {
            // 그래도 role 을 결정할 수 없으면 skip — 다음 데이터 fetch 때 다시 시도.
            skipped += 1;
            return;
          }
          const payload = {
            userId: profile.user_id,
            memberId: staff?.member_id || null,
            email: profile.email,
            displayName: profile.display_name,
            phone: profile.phone,
            // staff_profile 이 없으면 최소 정보만 — 원장이 스태프 탭에서 채울 수 있음.
            subject: staff?.subject,
            subjects: staff?.subjects,
            wageType: staff?.wage_type,
            hourlyWage: staff?.hourly_wage,
            monthlySalary: staff?.monthly_salary,
            hourlyMode: staff?.scope?.hourlyMode,
            memo: staff?.memo,
            status: staff?.status || 'active',
          };
          if (role === 'teacher') {
            upsertTeacher(payload);
            mirrored += 1;
          } else if (role === 'assistant') {
            upsertAssistant(payload);
            mirrored += 1;
          } else if (role === 'manager') {
            upsertManager(payload);
            mirrored += 1;
          } else {
            skipped += 1;
          }
        });
        if (typeof reconcileShiftLocalIds === 'function') reconcileShiftLocalIds();
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
        ensureCurrentAcademyDataScope(result.academyId);
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
          get().loadAcademyInvitations(),
          get().loadServerStaffShifts(),
        ]);
        return result;
      },

      // ── Phase 41 — 출결 설정 / 학생 체크인 이벤트 ─────────────────
      // owner 가 출결 설정을 업데이트. memberships 안 academy row 도 patch.
      saveAttendanceSettings: async (patch = {}) => {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase가 설정되지 않았어요.');
        }
        const academyId = get().currentAcademyId;
        if (!academyId) throw new Error('학원을 먼저 선택해주세요.');
        const saved = await updateAcademyAttendanceSettings(academyId, patch);
        if (saved) {
          set((s) => ({
            memberships: (s.memberships || []).map((m) =>
              m.academy_id === academyId
                ? { ...m, academy: { ...(m.academy || {}), ...saved } }
                : m,
            ),
          }));
        }
        return saved;
      },

      // ──────────────────────────────────────────────────────
      // Phase 44.5 / Phase A — 룰/예외/실제로그 로더 (read-only)
      // 호출처는 Phase B 에서 본격 연결. 현재는 initializeWorkspace 가
      // best-effort 로 호출해 캐시만 채운다 (실패해도 다른 흐름 막지 않음).
      // ──────────────────────────────────────────────────────
      loadStaffWorkRules: async () => {
        if (!isSupabaseConfigured) { set({ staffWorkRules: [] }); return []; }
        const academyId = get().currentAcademyId;
        if (!academyId) { set({ staffWorkRules: [], staffWorkRulesError: null }); return []; }
        set({ isStaffWorkRulesLoading: true, staffWorkRulesError: null });
        try {
          const list = await listStaffWorkRules(academyId);
          if (!isCurrentAcademy(get, academyId)) return list;
          set({ staffWorkRules: list, staffWorkRulesLoadedAt: new Date().toISOString() });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({ staffWorkRulesError: err?.message ?? '근무 규칙을 불러오지 못했어요.' });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isStaffWorkRulesLoading: false });
        }
      },

      loadStaffWorkExceptions: async ({ fromDate, toDate } = {}) => {
        if (!isSupabaseConfigured) { set({ staffWorkExceptions: [] }); return []; }
        const academyId = get().currentAcademyId;
        if (!academyId) { set({ staffWorkExceptions: [], staffWorkExceptionsError: null }); return []; }
        set({ isStaffWorkExceptionsLoading: true, staffWorkExceptionsError: null });
        try {
          const list = await listStaffWorkExceptions(academyId, { fromDate, toDate });
          if (!isCurrentAcademy(get, academyId)) return list;
          set({ staffWorkExceptions: list, staffWorkExceptionsLoadedAt: new Date().toISOString() });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({ staffWorkExceptionsError: err?.message ?? '근무 예외를 불러오지 못했어요.' });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isStaffWorkExceptionsLoading: false });
        }
      },

      createStaffWorkExceptionLocal: async (payload = {}) => {
        if (!isSupabaseConfigured) throw new Error('Supabase가 설정되지 않았어요.');
        const academyId = get().currentAcademyId;
        if (!academyId) throw new Error('학원을 먼저 선택해주세요.');
        const created = await createStaffWorkException({ academyId, ...payload });
        if (created) {
          set((s) => ({
            staffWorkExceptions: [created, ...(s.staffWorkExceptions || [])],
          }));
        }
        return created;
      },

      updateStaffWorkExceptionLocal: async (id, patch = {}) => {
        if (!isSupabaseConfigured) throw new Error('Supabase가 설정되지 않았어요.');
        if (!id) throw new Error('id가 필요해요.');
        const updated = await updateStaffWorkException(id, patch);
        if (updated) {
          set((s) => ({
            staffWorkExceptions: (s.staffWorkExceptions || []).map(
              (item) => (item.id === id ? updated : item),
            ),
          }));
        }
        return updated;
      },

      deleteStaffWorkExceptionLocal: async (id) => {
        if (!isSupabaseConfigured) throw new Error('Supabase가 설정되지 않았어요.');
        if (!id) throw new Error('id가 필요해요.');
        await deleteStaffWorkException(id);
        set((s) => ({
          staffWorkExceptions: (s.staffWorkExceptions || []).filter((item) => item.id !== id),
        }));
        return true;
      },

      loadClassScheduleRules: async () => {
        if (!isSupabaseConfigured) { set({ classScheduleRules: [] }); return []; }
        const academyId = get().currentAcademyId;
        if (!academyId) { set({ classScheduleRules: [], classScheduleRulesError: null }); return []; }
        set({ isClassScheduleRulesLoading: true, classScheduleRulesError: null });
        try {
          const list = await listClassScheduleRules(academyId);
          if (!isCurrentAcademy(get, academyId)) return list;
          set({ classScheduleRules: list, classScheduleRulesLoadedAt: new Date().toISOString() });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({ classScheduleRulesError: err?.message ?? '수업 스케줄 규칙을 불러오지 못했어요.' });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isClassScheduleRulesLoading: false });
        }
      },

      loadClassSessionExceptions: async ({ fromDate, toDate } = {}) => {
        if (!isSupabaseConfigured) { set({ classSessionExceptions: [] }); return []; }
        const academyId = get().currentAcademyId;
        if (!academyId) { set({ classSessionExceptions: [], classSessionExceptionsError: null }); return []; }
        set({ isClassSessionExceptionsLoading: true, classSessionExceptionsError: null });
        try {
          const list = await listClassSessionExceptions(academyId, { fromDate, toDate });
          if (!isCurrentAcademy(get, academyId)) return list;
          set({ classSessionExceptions: list, classSessionExceptionsLoadedAt: new Date().toISOString() });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({ classSessionExceptionsError: err?.message ?? '수업 예외를 불러오지 못했어요.' });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isClassSessionExceptionsLoading: false });
        }
      },

      loadStaffAttendanceLogs: async ({ fromDate, toDate, limit } = {}) => {
        if (!isSupabaseConfigured) { set({ staffAttendanceLogs: [] }); return []; }
        const academyId = get().currentAcademyId;
        if (!academyId) { set({ staffAttendanceLogs: [], staffAttendanceLogsError: null }); return []; }
        set({ isStaffAttendanceLogsLoading: true, staffAttendanceLogsError: null });
        try {
          const list = await listStaffAttendanceLogs(academyId, { fromDate, toDate, limit });
          if (!isCurrentAcademy(get, academyId)) return list;
          set({ staffAttendanceLogs: list, staffAttendanceLogsLoadedAt: new Date().toISOString() });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({ staffAttendanceLogsError: err?.message ?? '실제 출근 로그를 불러오지 못했어요.' });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isStaffAttendanceLogsLoading: false });
        }
      },

      // Phase 44.7 / Phase C — 출근 로그 INSERT (clock-in 또는 owner 수동 추가).
      // 호출자는 staff_user_id, staff_role, work_date, actual_start_time(optional),
      // scheduled_start_time(optional), source 를 명시.
      createStaffAttendanceLogLocal: async (payload = {}) => {
        if (!isSupabaseConfigured) throw new Error('Supabase가 설정되지 않았어요.');
        const academyId = get().currentAcademyId;
        if (!academyId) throw new Error('학원을 먼저 선택해주세요.');
        const created = await createStaffAttendanceLog({ academyId, ...payload });
        if (created) {
          set((s) => ({
            staffAttendanceLogs: [created, ...(s.staffAttendanceLogs || [])],
          }));
        }
        return created;
      },

      // Phase 44.7 / Phase C — 출근 로그 UPDATE (clock-out, 승인, 수정 등).
      updateStaffAttendanceLogLocal: async (id, patch = {}) => {
        if (!isSupabaseConfigured) throw new Error('Supabase가 설정되지 않았어요.');
        if (!id) throw new Error('id가 필요해요.');
        const updated = await updateStaffAttendanceLog(id, patch);
        if (updated) {
          set((s) => ({
            staffAttendanceLogs: (s.staffAttendanceLogs || []).map(
              (log) => (log.id === id ? updated : log),
            ),
          }));
        }
        return updated;
      },

      // Phase 44.7 / Phase C — class_session_exceptions INSERT.
      createClassSessionExceptionLocal: async (payload = {}) => {
        if (!isSupabaseConfigured) throw new Error('Supabase가 설정되지 않았어요.');
        const academyId = get().currentAcademyId;
        if (!academyId) throw new Error('학원을 먼저 선택해주세요.');
        const created = await createClassSessionException({ academyId, ...payload });
        if (created) {
          set((s) => ({
            classSessionExceptions: [created, ...(s.classSessionExceptions || [])],
          }));
        }
        return created;
      },

      // 학생 등·하원 이벤트 목록 (read-only). 기본은 오늘 + 최근 200건.
      loadStudentCheckEvents: async ({ sinceDateYMD, limit } = {}) => {
        if (!isSupabaseConfigured) {
          set({ studentCheckEvents: [] });
          return [];
        }
        const academyId = get().currentAcademyId;
        if (!academyId) {
          set({ studentCheckEvents: [], studentCheckEventsError: null });
          return [];
        }
        set({ isStudentCheckEventsLoading: true, studentCheckEventsError: null });
        try {
          const list = await listStudentCheckEvents(academyId, { sinceDateYMD, limit });
          if (!isCurrentAcademy(get, academyId)) return list;
          set({
            studentCheckEvents: list,
            studentCheckEventsLoadedAt: new Date().toISOString(),
          });
          return list;
        } catch (err) {
          if (!isCurrentAcademy(get, academyId)) return [];
          set({
            studentCheckEventsError:
              err?.message ?? '학생 체크인 이벤트를 불러오지 못했어요.',
          });
          return [];
        } finally {
          if (isCurrentAcademy(get, academyId)) set({ isStudentCheckEventsLoading: false });
        }
      },

      // 학생 등·하원 이벤트 1건 생성. 로컬 캐시도 즉시 prepend.
      createStudentCheckEventLocal: async ({ studentId, eventType, source = 'qr', sessionId, eventTime }) => {
        if (!isSupabaseConfigured) {
          throw new Error('Supabase가 설정되지 않았어요.');
        }
        const academyId = get().currentAcademyId;
        if (!academyId) throw new Error('학원을 먼저 선택해주세요.');
        const created = await createStudentCheckEvent({
          academyId, studentId, eventType, source, sessionId, eventTime,
        });
        if (created) {
          set((s) => ({ studentCheckEvents: [created, ...(s.studentCheckEvents || [])] }));
        }
        return created;
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
            get().loadAcademyInvitations(),
            get().loadServerStaffShifts(),
            get().loadStudentCheckEvents(),
            // Phase 44.5 / Phase A — 룰/예외 캐시는 best-effort. 실패해도 워크스페이스
            // 초기화는 성공으로 처리. staff_attendance_logs 는 Phase C 까지 빈 채로 둠.
            get().loadStaffWorkRules(),
            get().loadStaffWorkExceptions(),
            get().loadClassScheduleRules(),
            get().loadClassSessionExceptions(),
            // Phase 44.7 / Phase C — 실제 출근 로그도 best-effort 로드.
            get().loadStaffAttendanceLogs({ limit: 200 }),
          ]);
          set({ isWorkspaceReady: true });
        } finally {
          set({ isWorkspaceLoading: false });
        }
      },
    }),
    {
      name: WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // currentAcademyId 만 영속화. 나머지는 매 세션 새로 fetch.
      partialize: (state) => ({ currentAcademyId: state.currentAcademyId }),
    }
  )
);

export default useWorkspaceStore;
