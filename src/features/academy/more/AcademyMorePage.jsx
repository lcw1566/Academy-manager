import { useMemo, useState, useEffect } from 'react';
import {
  AlertTriangle, ChevronRight, ChevronLeft, Pencil, CalendarClock, Wallet,
  RefreshCw, LogOut, BookOpen, Stethoscope, Inbox, Loader2,
} from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import { roleMap, formatPhoneNumber } from '../../../utils/format';
import { WAGE_TYPE_LABELS } from '../../../constants/labels';
import StaffInviteWidget from './StaffInviteWidget';
import WorkspaceSection from '../../workspace/WorkspaceSection';
import ProfileEditModal from '../../workspace/ProfileEditModal';
import AcademyStaffMembersSection from './AcademyStaffMembersSection';
import RekeyStaffModal from './RekeyStaffModal';
import StaffInviteModal from './StaffInviteModal';
import StaffShiftPage from './StaffShiftPage';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { UserCog, Building2, Mail, Phone } from 'lucide-react';
import { clearWorkspacePicked } from '../../auth/WorkspaceSelectionPage';

// ─── Constants ──────────────────────────────────────────────────
const WAGE_TYPES = [
  { id: 'hourly', label: '시급' },
  { id: 'monthly', label: '월급' },
];

const SUBJECTS = ['수학', '영어', '국어', '과학', '사회', '물리', '화학', '역사', '기타'];

// ─── Normalize (null/undefined guard) ───────────────────────────
function normalizeTeacher(t) {
  if (!t) return null;
  return {
    wageType: 'hourly', hourlyWage: 0, monthlyWage: 0,
    memo: '', phone: '', status: 'active',
    ...t,
    name: t.name || '(이름 없음)',
    subjects: Array.isArray(t.subjects) ? t.subjects : [],
  };
}

function normalizeAssistant(a) {
  if (!a) return null;
  return {
    wageType: 'hourly', hourlyWage: 0, monthlySalary: 0,
    memo: '', phone: '', status: 'active',
    ...a,
    name: a.name || '(이름 없음)',
    subjects: Array.isArray(a.subjects) ? a.subjects : [],
  };
}

function wageLabel(w) { return WAGE_TYPE_LABELS[w] || w || '–'; }

// ─── 강사 상세 페이지 ────────────────────────────────────────────
// ClassGroupDetailPage와 동일한 패턴: fixed top-0 z-20 헤더 + 본문
function TeacherDetailPage({ teacher, onBack, onEdit, onDelete, assignmentCounts, onRekey }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const wageInfo = teacher.wageType === 'monthly'
    ? `월급 ${(teacher.monthlySalary || teacher.monthlyWage || 0).toLocaleString()}원`
    : `시급 ${(teacher.hourlyWage || 0).toLocaleString()}원`;

  return (
    <div>
      {/* 헤더 – ClassGroupDetailPage와 동일 패턴 */}
      <div className="fixed top-0 left-0 right-0 z-20 bg-white/95 border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 h-14">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <p className="flex-1 font-bold text-gray-900">강사 정보</p>
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 text-sm font-semibold text-blue-600 px-3 py-1.5 rounded-xl active:bg-blue-50"
          >
            <Pencil size={14} />
            수정하기
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div className="pt-16 pb-24 px-4 flex flex-col gap-4">
        {/* 프로필 카드 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">
              {teacher.name.charAt(0)}
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{teacher.name}</p>
              <p className="text-sm text-blue-600 font-medium">강사</p>
            </div>
          </div>
          {teacher.phone ? (
            <div className="flex items-center justify-between py-2.5 border-t border-gray-50">
              <span className="text-sm text-gray-500">연락처</span>
              <span className="text-sm font-medium text-gray-800">{teacher.phone}</span>
            </div>
          ) : null}
          {teacher.email ? (
            <div className="flex items-center justify-between py-2.5 border-t border-gray-50">
              <span className="text-sm text-gray-500">계정 이메일</span>
              <span className="text-sm font-medium text-gray-800 truncate ml-2">{teacher.email}</span>
            </div>
          ) : null}
          {teacher.inviteStatus ? (
            <div className="flex items-center justify-between py-2.5 border-t border-gray-50">
              <span className="text-sm text-gray-500">초대 상태</span>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                teacher.inviteStatus === 'accepted'
                  ? 'bg-emerald-50 text-emerald-700'
                  : teacher.inviteStatus === 'pending'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {teacher.inviteStatus === 'accepted'
                  ? '수락됨'
                  : teacher.inviteStatus === 'pending'
                  ? '대기 중'
                  : '취소됨'}
              </span>
            </div>
          ) : null}
        </div>

        {/* 수업 배정 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 mb-3">수업 배정</p>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-gray-500">맡고 있는 반 / 수업 회차</span>
            <span className="text-xs font-semibold text-gray-800">
              {assignmentCounts?.groups ?? 0}개 · {assignmentCounts?.sessions ?? 0}개
            </span>
          </div>
          {onRekey && (
            <button
              type="button"
              onClick={onRekey}
              className="w-full mt-3 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold active:bg-blue-100"
            >
              기존 수업 배정 연결
            </button>
          )}
        </div>

        {/* 담당 과목 */}
        {teacher.subjects.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-bold text-gray-400 mb-3">담당 과목</p>
            <div className="flex flex-wrap gap-2">
              {teacher.subjects.map((s) => (
                <span key={s} className="text-xs font-semibold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* 급여 정보 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 mb-3">급여 정보</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">급여 방식</span>
            <span className="text-sm font-medium text-gray-800">{wageLabel(teacher.wageType)}</span>
          </div>
          <div className="flex items-center justify-between mt-2.5">
            <span className="text-sm text-gray-500">금액</span>
            <span className="text-sm font-bold text-gray-900">{wageInfo}</span>
          </div>
        </div>

        {/* 메모 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 mb-2">메모</p>
          <p className="text-sm text-gray-700">{teacher.memo || '메모가 없어요.'}</p>
        </div>

        {/* 삭제 버튼 */}
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full mt-2 py-4 rounded-2xl bg-red-50 text-red-500 font-bold text-sm border border-red-100"
        >
          강사 삭제
        </button>
      </div>

      {/* 삭제 확인 모달 */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="강사 삭제"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">취소</button>
            <button type="button" onClick={onDelete} className="flex-1 py-3.5 rounded-xl bg-red-500 text-white text-sm font-bold">삭제</button>
          </div>
        }
      >
        <div className="bg-red-50 rounded-2xl px-4 py-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 mb-1">{teacher.name} 강사를 삭제할까요?</p>
            <p className="text-xs text-red-500">삭제한 정보는 되돌릴 수 없어요.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── 보조강사 상세 페이지 ────────────────────────────────────────
function AssistantDetailPage({ assistant, onBack, onEdit, onDelete, taskCount, onRekey }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const wageInfo = assistant.wageType === 'monthly'
    ? `월급 ${(assistant.monthlySalary || 0).toLocaleString()}원`
    : `시급 ${(assistant.hourlyWage || 0).toLocaleString()}원`;

  return (
    <div>
      {/* 헤더 */}
      <div className="fixed top-0 left-0 right-0 z-20 bg-white/95 border-b border-gray-100">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 h-14">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <p className="flex-1 font-bold text-gray-900">보조강사 정보</p>
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 text-sm font-semibold text-purple-600 px-3 py-1.5 rounded-xl active:bg-purple-50"
          >
            <Pencil size={14} />
            수정하기
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div className="pt-16 pb-24 px-4 flex flex-col gap-4">
        {/* 프로필 카드 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center text-xl font-bold text-purple-600 flex-shrink-0">
              {assistant.name.charAt(0)}
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{assistant.name}</p>
              <p className="text-sm text-purple-600 font-medium">보조강사</p>
            </div>
          </div>
          {assistant.phone ? (
            <div className="flex items-center justify-between py-2.5 border-t border-gray-50">
              <span className="text-sm text-gray-500">연락처</span>
              <span className="text-sm font-medium text-gray-800">{assistant.phone}</span>
            </div>
          ) : null}
          {assistant.email ? (
            <div className="flex items-center justify-between py-2.5 border-t border-gray-50">
              <span className="text-sm text-gray-500">계정 이메일</span>
              <span className="text-sm font-medium text-gray-800 truncate ml-2">{assistant.email}</span>
            </div>
          ) : null}
          {assistant.inviteStatus ? (
            <div className="flex items-center justify-between py-2.5 border-t border-gray-50">
              <span className="text-sm text-gray-500">초대 상태</span>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                assistant.inviteStatus === 'accepted'
                  ? 'bg-emerald-50 text-emerald-700'
                  : assistant.inviteStatus === 'pending'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {assistant.inviteStatus === 'accepted'
                  ? '수락됨'
                  : assistant.inviteStatus === 'pending'
                  ? '대기 중'
                  : '취소됨'}
              </span>
            </div>
          ) : null}
        </div>

        {/* 클리닉 배정 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 mb-3">클리닉 배정</p>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-gray-500">맡고 있는 클리닉 업무</span>
            <span className="text-xs font-semibold text-gray-800">{taskCount ?? 0}개</span>
          </div>
          {onRekey && (
            <button
              type="button"
              onClick={onRekey}
              className="w-full mt-3 py-2.5 rounded-xl bg-purple-50 text-purple-700 text-xs font-bold active:bg-purple-100"
            >
              기존 클리닉 배정 연결
            </button>
          )}
        </div>

        {/* 담당 과목 */}
        {assistant.subjects.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-bold text-gray-400 mb-2">담당 과목</p>
            <div className="flex flex-wrap gap-2">
              {assistant.subjects.map((s) => (
                <span key={s} className="text-xs font-semibold bg-purple-50 text-purple-600 px-3 py-1.5 rounded-full">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* 급여 정보 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 mb-3">급여 정보</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">급여 방식</span>
            <span className="text-sm font-medium text-gray-800">{wageLabel(assistant.wageType)}</span>
          </div>
          <div className="flex items-center justify-between mt-2.5">
            <span className="text-sm text-gray-500">금액</span>
            <span className="text-sm font-bold text-gray-900">{wageInfo}</span>
          </div>
        </div>

        {/* 메모 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 mb-2">메모</p>
          <p className="text-sm text-gray-700">{assistant.memo || '메모가 없어요.'}</p>
        </div>

        {/* 삭제 버튼 */}
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full mt-2 py-4 rounded-2xl bg-red-50 text-red-500 font-bold text-sm border border-red-100"
        >
          보조강사 삭제
        </button>
      </div>

      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="보조강사 삭제"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">취소</button>
            <button type="button" onClick={onDelete} className="flex-1 py-3.5 rounded-xl bg-red-500 text-white text-sm font-bold">삭제</button>
          </div>
        }
      >
        <div className="bg-red-50 rounded-2xl px-4 py-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 mb-1">{assistant.name} 보조강사를 삭제할까요?</p>
            <p className="text-xs text-red-500">삭제한 정보는 되돌릴 수 없어요.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────
export default function AcademyMorePage() {
  // Phase 29 — 개별 셀렉터 + 안전 fallback. HMR 또는 store 마이그레이션 중 어떤
  // 키가 undefined 로 들어오는 경우에도 컴포넌트가 터지지 않도록 방어한다.
  const role = useAcademyStore((s) => s.role);
  const academyProfile = useAcademyStore((s) => s.academyProfile);
  const setAcademyProfile = useAcademyStore((s) => s.setAcademyProfile);
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const addTeacher = useAcademyStore((s) => s.addTeacher);
  const updateTeacher = useAcademyStore((s) => s.updateTeacher);
  const deleteTeacher = useAcademyStore((s) => s.deleteTeacher);
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const addAssistant = useAcademyStore((s) => s.addAssistant);
  const updateAssistant = useAcademyStore((s) => s.updateAssistant);
  const deleteAssistant = useAcademyStore((s) => s.deleteAssistant);
  const classGroups = useAcademyStore((s) => s.classGroups) ?? [];
  const classSessions = useAcademyStore((s) => s.classSessions) ?? [];
  const clinicTasks = useAcademyStore((s) => s.clinicTasks) ?? [];
  const showToast = useAcademyStore((s) => s.showToast);

  // 뷰 모드 상태 — ID만 보관, 스냅샷 금지
  const [viewTeacherId, setViewTeacherId]       = useState(null);
  const [viewAssistantId, setViewAssistantId]   = useState(null);
  const [teacherFormOpen, setTeacherFormOpen]   = useState(false);
  const [assistantFormOpen, setAssistantFormOpen] = useState(false);
  const [isNewTeacher, setIsNewTeacher]         = useState(false);
  const [isNewAssistant, setIsNewAssistant]     = useState(false);
  const [showProfileEdit, setShowProfileEdit]   = useState(false);
  const [showUserProfileEdit, setShowUserProfileEdit] = useState(false);
  const [rekeyContext, setRekeyContext] = useState(null); // { kind, staff } | null
  // Pre-Phase 31 — 새로운 초대 진입점은 email-only 모달만 띄운다.
  // (기존 TeacherFormModal / AssistantFormModal 은 detail 페이지의 "수정" 에서만 사용.)
  const [inviteRole, setInviteRole] = useState(null); // null | 'teacher' | 'assistant'
  // Phase 31 — 근무표 진입. shiftContext = { staff, staffRole } | null
  const [shiftContext, setShiftContext] = useState(null);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUserEmail = useAuthStore((s) => s.user?.email);
  const userProfile = useWorkspaceStore((s) => s.profile);
  const academyMemberProfiles = useWorkspaceStore((s) => s.academyMemberProfiles) ?? [];
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);

  // Post-Phase 32 — 진짜 학원 이름은 memberships 의 academy.name. 로컬
  // useAcademyStore.academyProfile 는 초기값 "우리 학원" default 가 박혀있어서
  // 카드에 노출하면 항상 그 값이 나온다. memberships 우선으로 교체.
  const currentMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );
  const currentAcademyName = currentMembership?.academy?.name || null;

  // academyProfile.name 자동 동기화 — 학원이 바뀌거나 이름이 갱신되면 로컬
  // store 의 academyProfile 도 같이 맞춰서, 다른 위치(예: 헤더, 로컬 hydrate
  // 모달)도 일관된 이름을 본다. createAcademy 직후에도 곧바로 반영된다.
  useEffect(() => {
    if (!currentAcademyId || !currentAcademyName) return;
    const localName = academyProfile?.name;
    if (localName === currentAcademyName) return;
    setAcademyProfile({
      ...(academyProfile || { ownerName: '', address: '', phone: '' }),
      name: currentAcademyName,
    });
  }, [currentAcademyId, currentAcademyName, academyProfile, setAcademyProfile]);

  // Phase 28 hotfix: 마지막 동기화 시각 — owner More 하단 Danger Zone 위에 한 줄로 표시.
  const lastSyncedAt = useWorkspaceStore((s) => s.serverStudentsLoadedAt)
    || useWorkspaceStore((s) => s.serverClassGroupsLoadedAt)
    || useWorkspaceStore((s) => s.serverClassSessionsLoadedAt);
  const lastSyncedLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const isOwner = role === 'owner';
  // Phase 30: 원장 / 강사 / 보조강사 모두 여러 학원에 속할 수 있다.
  // 학원이 2개 이상이면 "학원 전환" 버튼 노출.
  const isStaff = role === 'teacher' || role === 'assistant';
  const showSwitchAcademy = memberships.length > 1;
  // Phase 29: 신규 가입한 원장(학원 없음) 은 학원 생성 진입점이 필요하다.
  // AcademyStaffMembersSection 은 currentAcademyId 없으면 null 이라 화면이 텅 비게 된다.
  const ownerHasNoAcademy = isOwner && memberships.length === 0;

  const handleSwitchAcademy = () => {
    // sessionStorage 플래그를 비우면 다음 render 에서 App.jsx 가 WorkspaceSelectionPage 를 노출.
    clearWorkspacePicked();
    // 강제 리렌더링: setRole 동일 값으로 호출하면 academy store 가 state 를 갱신해
    // App.jsx 의 renderLayout 이 재평가된다.
    // 더 깔끔하게: window.location.reload() — 사용자 데이터 손실 없음 (모두 store/localStorage)
    if (typeof window !== 'undefined') window.location.reload();
  };

  // 서버 멤버 이메일 셋 — 로컬 강사/보조강사 카드에 "서버 연결됨" 배지 표시용.
  // 이메일은 lowercase 로 비교 (academy_invitations 와 동일 규칙).
  const serverMemberEmails = useMemo(
    () => new Set(
      (academyMemberProfiles || [])
        .map((p) => (p.email || '').trim().toLowerCase())
        .filter(Boolean),
    ),
    [academyMemberProfiles],
  );
  const isLocalStaffLinked = (localStaff) => {
    const email = (localStaff?.email || '').trim().toLowerCase();
    return !!email && serverMemberEmails.has(email);
  };

  // Phase 24 diagnostics: count assignments per local staff id.
  // Memoize to avoid repeated O(N*M) scans on every render.
  const teacherAssignmentCounts = useMemo(() => {
    const map = new Map();
    classGroups.forEach((g) => {
      if (!g.teacherId) return;
      const entry = map.get(g.teacherId) || { groups: 0, sessions: 0 };
      entry.groups += 1;
      map.set(g.teacherId, entry);
    });
    classSessions.forEach((s) => {
      if (!s.teacherId) return;
      const entry = map.get(s.teacherId) || { groups: 0, sessions: 0 };
      entry.sessions += 1;
      map.set(s.teacherId, entry);
    });
    return map;
  }, [classGroups, classSessions]);

  const assistantAssignmentCounts = useMemo(() => {
    const map = new Map();
    clinicTasks.forEach((t) => {
      if (!t.assignedToId) return;
      map.set(t.assignedToId, (map.get(t.assignedToId) || 0) + 1);
    });
    return map;
  }, [clinicTasks]);

  // 항상 store에서 최신 데이터 조회 (stale snapshot 방지)
  const viewTeacher = useMemo(
    () => normalizeTeacher(academyTeachers.find((t) => t.id === viewTeacherId) || null),
    [viewTeacherId, academyTeachers]
  );

  const viewAssistant = useMemo(
    () => normalizeAssistant(academyAssistants.find((a) => a.id === viewAssistantId) || null),
    [viewAssistantId, academyAssistants]
  );

  // 폼 초기값: 신규면 null, 수정이면 현재 상세 데이터
  const teacherFormInitial  = isNewTeacher  ? null : viewTeacher;
  const assistantFormInitial = isNewAssistant ? null : viewAssistant;

  // ── 강사 핸들러 ────────────────────────────────────────────────
  const openTeacherDetail  = (id)  => setViewTeacherId(id);
  const closeTeacherDetail = ()    => { setViewTeacherId(null); setTeacherFormOpen(false); };
  const openTeacherEdit    = ()    => { setIsNewTeacher(false); setTeacherFormOpen(true); };
  // Pre-Phase 31 — "강사 추가" 는 email-only 초대 모달로 이동.
  // 이름·연락처는 본인 프로필에서, 과목·급여는 수락 후 학원 설정에서 처리한다.
  const openTeacherAdd     = ()    => { setInviteRole('teacher'); };

  // Phase 31 — 구성원의 user_id 와 role 로 로컬 staff 매핑 후 근무표 열기.
  // 매칭이 안 되면 (예: server staff 가 mirror 안 됐을 때) email 매칭도 시도.
  const openShiftForUser = ({ userId, role: shiftRole, email }) => {
    if (!shiftRole) return;
    const list = shiftRole === 'assistant' ? academyAssistants : academyTeachers;
    let staffEntry = findLocalStaffForUser(list, { userId, email });
    if (!staffEntry && userId) {
      // 서버 mirror 안 됐을 수도 — 가상 staff entry 생성 (id=teacher_<userId>).
      // 실제로는 syncLocalStaffFromServerMembers 가 곧 채워주지만, 즉시 열기 가능하도록.
      staffEntry = {
        id: `${shiftRole}_${userId}`,
        name: '(이름 없음)',
        serverUserId: userId,
        email: email || '',
      };
    }
    if (!staffEntry) return;
    setShiftContext({ staff: staffEntry, staffRole: shiftRole });
  };
  const closeTeacherForm   = ()    => { setTeacherFormOpen(false); };

  const handleSaveTeacher = (data) => {
    if (isNewTeacher) {
      addTeacher(data);
    } else if (viewTeacherId) {
      updateTeacher(viewTeacherId, data);
    }
    setTeacherFormOpen(false);
  };

  const handleDeleteTeacher = () => {
    if (!viewTeacherId) return;
    deleteTeacher(viewTeacherId);
    setViewTeacherId(null);
  };

  // ── 보조강사 핸들러 ────────────────────────────────────────────
  const openAssistantDetail  = (id) => setViewAssistantId(id);
  const closeAssistantDetail = ()   => { setViewAssistantId(null); setAssistantFormOpen(false); };
  const openAssistantEdit    = ()   => { setIsNewAssistant(false); setAssistantFormOpen(true); };
  // Pre-Phase 31 — "보조강사 추가" 도 email-only 초대 모달로 이동.
  const openAssistantAdd     = ()   => { setInviteRole('assistant'); };
  const closeAssistantForm   = ()   => { setAssistantFormOpen(false); };

  const handleSaveAssistant = (data) => {
    if (isNewAssistant) {
      addAssistant(data);
    } else if (viewAssistantId) {
      updateAssistant(viewAssistantId, data);
    }
    setAssistantFormOpen(false);
  };

  const handleDeleteAssistant = () => {
    if (!viewAssistantId) return;
    deleteAssistant(viewAssistantId);
    setViewAssistantId(null);
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 강사 상세 뷰 — 목록 대신 상세 페이지를 렌더링
  // fixed overlay 금지: AcademyMorePage 자체가 이 JSX를 반환함
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (viewTeacherId) {
    if (!viewTeacher) {
      return <StaffNotFound label="강사" onBack={closeTeacherDetail} />;
    }
    return (
      <>
        <TeacherDetailPage
          teacher={viewTeacher}
          onBack={closeTeacherDetail}
          onEdit={openTeacherEdit}
          onDelete={handleDeleteTeacher}
          assignmentCounts={teacherAssignmentCounts.get(viewTeacher.id) || { groups: 0, sessions: 0 }}
          onRekey={
            viewTeacher.source === 'server'
              ? () => setRekeyContext({ kind: 'teacher', staff: viewTeacher })
              : null
          }
        />
        {teacherFormOpen && (
          <TeacherFormModal
            initialData={teacherFormInitial}
            onClose={closeTeacherForm}
            onSave={handleSaveTeacher}
          />
        )}
        <RekeyStaffModal
          isOpen={rekeyContext?.kind === 'teacher'}
          onClose={() => setRekeyContext(null)}
          kind="teacher"
          targetStaff={rekeyContext?.kind === 'teacher' ? rekeyContext.staff : null}
        />
      </>
    );
  }

  // Phase 31 — 근무표 진입 (전체 페이지로 띄움)
  if (shiftContext?.staff) {
    return (
      <StaffShiftPage
        staff={shiftContext.staff}
        staffRole={shiftContext.staffRole}
        canEdit={isOwner || shiftContext.staff.serverUserId === useAuthStore.getState().user?.id}
        onBack={() => setShiftContext(null)}
      />
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 보조강사 상세 뷰
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (viewAssistantId) {
    if (!viewAssistant) {
      return <StaffNotFound label="보조강사" onBack={closeAssistantDetail} />;
    }
    return (
      <>
        <AssistantDetailPage
          assistant={viewAssistant}
          onBack={closeAssistantDetail}
          onEdit={openAssistantEdit}
          onDelete={handleDeleteAssistant}
          taskCount={assistantAssignmentCounts.get(viewAssistant.id) || 0}
          onRekey={
            viewAssistant.source === 'server'
              ? () => setRekeyContext({ kind: 'assistant', staff: viewAssistant })
              : null
          }
        />
        {assistantFormOpen && (
          <AssistantFormModal
            initialData={assistantFormInitial}
            onClose={closeAssistantForm}
            onSave={handleSaveAssistant}
          />
        )}
        <RekeyStaffModal
          isOpen={rekeyContext?.kind === 'assistant'}
          onClose={() => setRekeyContext(null)}
          kind="assistant"
          targetStaff={rekeyContext?.kind === 'assistant' ? rekeyContext.staff : null}
        />
      </>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 목록 뷰 (기본)
  // 역할별 분기 (Phase 28 hotfix):
  //   - Owner : 학원 정보(통합) → 구성원 관리 → 마지막 동기화 → Danger Zone
  //   - Teacher/Assistant : 학원 카드 → AuthSection → WorkspaceSection → 학원 전환 → 내 프로필
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div>
      <Header title="더보기" />
      <div className="pt-14 pb-6">

      {isOwner ? (
        ownerHasNoAcademy ? (
          <OwnerEmptyState
            displayName={userProfile?.display_name || authUserEmail}
            onEditMyProfile={() => setShowUserProfileEdit(true)}
          />
        ) : (
          <OwnerMoreSections
            academyProfile={academyProfile}
            academyName={currentAcademyName}
            displayName={userProfile?.display_name}
            email={authUserEmail}
            phone={userProfile?.phone}
            memberships={memberships}
            showSwitchAcademy={showSwitchAcademy}
            lastSyncedLabel={lastSyncedLabel}
            onEditAcademy={() => setShowProfileEdit(true)}
            onEditMyProfile={() => setShowUserProfileEdit(true)}
            onOpenTeacherAdd={openTeacherAdd}
            onOpenAssistantAdd={openAssistantAdd}
            onOpenShift={openShiftForUser}
            onSwitchAcademy={handleSwitchAcademy}
          />
        )
      ) : (
        <StaffMoreSections
          role={role}
          academyProfile={academyProfile}
          displayName={userProfile?.display_name}
          email={authUserEmail}
          phone={userProfile?.phone}
          memberships={memberships}
          showSwitchAcademy={showSwitchAcademy}
          onEditMyProfile={() => setShowUserProfileEdit(true)}
          onSwitchAcademy={handleSwitchAcademy}
        />
      )}

      </div>

      {/* Pre-Phase 31 — 신규 강사 추가는 StaffInviteModal 로 일원화됨.
          dead 블록(isNewTeacher/isNewAssistant) 은 제거. detail 페이지의 "수정"
          진입은 그대로 동작한다 (isNewX=false 로 setTeacherFormOpen). */}

      {/* 학원 프로필 수정 */}
      {showProfileEdit && (
        <AcademyProfileModal
          profile={academyProfile}
          onClose={() => setShowProfileEdit(false)}
          onSave={(data) => { setAcademyProfile(data); showToast('학원 정보가 저장되었습니다.'); setShowProfileEdit(false); }}
        />
      )}

      {/* 내 프로필 수정 모달 */}
      <ProfileEditModal
        isOpen={showUserProfileEdit}
        onClose={() => setShowUserProfileEdit(false)}
      />

      {/* Pre-Phase 31 — 강사/보조강사 초대 (email-only) 모달 */}
      {inviteRole && (
        <StaffInviteModal
          role={inviteRole}
          onClose={() => setInviteRole(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Phase 31 UI cleanup — 공통 layout 헬퍼
// ═══════════════════════════════════════════════════════════════════

// 섹션 제목 (예: "운영 관리", "계정")
function SectionTitle({ children, className = '' }) {
  return (
    <p className={`mx-4 mt-6 mb-2 text-xs font-bold text-gray-800 ${className}`}>
      {children}
    </p>
  );
}

// 깔끔한 settings row (icon + 제목 + 부제 + chevron).
// 색 톤은 단순화 (icon 색상만 lightly tint). 일관된 시각 무게.
function SettingsRow({
  icon: Icon, title, subtitle, onClick, tone = 'gray', danger = false,
  rightAdornment,
}) {
  const toneClass =
    danger ? 'text-red-600 bg-red-50' :
    tone === 'blue' ? 'text-blue-600 bg-blue-50' :
    tone === 'emerald' ? 'text-emerald-600 bg-emerald-50' :
    'text-gray-600 bg-gray-100';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 text-left active:bg-gray-50 ${danger ? 'border border-red-100' : 'border border-gray-100'} shadow-sm`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${toneClass}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${danger ? 'text-red-600' : 'text-gray-900'}`}>{title}</p>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      {rightAdornment || (
        <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
      )}
    </button>
  );
}

// 같은 섹션 안 카드들을 묶는 그리드 (mobile: 1col, md+: 2col)
function CardGrid({ children }) {
  return (
    <div className="mx-4 grid grid-cols-1 md:grid-cols-2 gap-2">
      {children}
    </div>
  );
}

// Owner More — 원장이 학원이 없는 상태 (학원 만들기 안내).
// 학원 생성 UI 는 WorkspaceSection 이 담당 — 학원 0개 owner 케이스에서만 노출.
function OwnerEmptyState({ displayName, onEditMyProfile }) {
  return (
    <>
      <div className="mx-4 mt-4 bg-white rounded-2xl p-5 shadow-sm">
        <p className="font-bold text-gray-900 text-base mb-1">학원을 먼저 만들어주세요</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          학원을 만들면 강사·보조강사 초대와 학생 관리를 시작할 수 있어요.
        </p>
      </div>
      <WorkspaceSection />
      <SectionTitle>계정</SectionTitle>
      <div className="mx-4 flex flex-col gap-2">
        <SettingsRow
          icon={UserCog}
          title={displayName || '내 프로필'}
          subtitle="이름·연락처 수정"
          onClick={onEditMyProfile}
        />
        <InlineLogoutButton />
      </div>
    </>
  );
}

// Owner More — 메인 layout (학원 있는 원장)
function OwnerMoreSections({
  academyProfile, academyName, displayName, email, phone, memberships = [], showSwitchAcademy,
  lastSyncedLabel,
  onEditAcademy, onEditMyProfile,
  onOpenTeacherAdd, onOpenAssistantAdd, onOpenShift, onSwitchAcademy,
}) {
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const showToast = useAcademyStore((s) => s.showToast);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const ws = useWorkspaceStore.getState();
    try {
      await Promise.all([
        ws.loadServerStudents?.(),
        ws.loadServerClassGroups?.(),
        ws.loadServerClassSessions?.(),
        ws.loadServerLessonRecords?.(),
        ws.loadServerAttendanceRecords?.(),
        ws.loadServerClinicRecords?.(),
        ws.loadServerPayments?.(),
        ws.loadServerPayrolls?.(),
        ws.loadAcademyMemberProfiles?.(),
        ws.loadAcademyStaffProfiles?.(),
        ws.loadAcademyInvitations?.(),
        ws.loadServerStaffShifts?.(),
      ]);
      showToast('새로고침했어요.');
    } catch (err) {
      console.warn('[refresh-all] failed', err);
      showToast('일부 데이터를 불러오지 못했어요.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      {/* A. 학원 정보 + 원장 프로필 — academyName 우선 (memberships 의 진짜 이름) */}
      <AcademyOwnerInfoCard
        academyProfile={academyProfile}
        academyName={academyName}
        displayName={displayName}
        email={email}
        phone={phone}
        onEditAcademy={onEditAcademy}
        onEditMyProfile={onEditMyProfile}
      />

      {/* B. 운영 관리 */}
      <SectionTitle>운영 관리</SectionTitle>
      <div className="mx-4">
        <AcademyStaffMembersSection
          onAddTeacher={onOpenTeacherAdd}
          onAddAssistant={onOpenAssistantAdd}
          onOpenShift={onOpenShift}
          embedded
        />
      </div>
      <div className="mx-4 mt-2 flex flex-col gap-2">
        <SettingsRow
          icon={CalendarClock}
          tone="blue"
          title="근무 관리"
          subtitle="오늘 출근·이번 주 근무표·근무 추가"
          onClick={() => setActiveTab('work')}
        />
        <SettingsRow
          icon={Wallet}
          tone="emerald"
          title="정산/급여 설정"
          subtitle="이번 달 급여 명세 생성과 지급 상태"
          onClick={() => setActiveTab('settlement')}
        />
        <SettingsRow
          icon={RefreshCw}
          title="데이터 관리"
          subtitle={lastSyncedLabel ? `마지막 동기화 ${lastSyncedLabel}` : '최신 정보를 다시 불러와요'}
          onClick={handleRefresh}
          rightAdornment={
            refreshing ? <Loader2 size={14} className="animate-spin text-gray-400" /> : undefined
          }
        />
        {showSwitchAcademy && (
          <SettingsRow
            icon={Building2}
            tone="blue"
            title="학원 전환"
            subtitle={`다른 학원으로 이동 (${memberships.length}개 보유)`}
            onClick={onSwitchAcademy}
          />
        )}
      </div>

      {/* C. 계정 — 상단 카드에서 이미 프로필 정보를 보여주므로 로그아웃만 노출 */}
      <SectionTitle>계정</SectionTitle>
      <div className="mx-4">
        <InlineLogoutButton />
      </div>
    </>
  );
}

// Staff (teacher/assistant) More 메인 layout
function StaffMoreSections({
  role, academyProfile, displayName, email, phone, memberships = [], showSwitchAcademy,
  onEditMyProfile, onSwitchAcademy,
}) {
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const myPendingInvitations = useWorkspaceStore((s) => s.myPendingInvitations) ?? [];
  const acceptInvitation = useWorkspaceStore((s) => s.acceptInvitation);
  const showToast = useAcademyStore((s) => s.showToast);
  const [acceptingId, setAcceptingId] = useState(null);

  const myMembership = memberships.find((m) => m.academy_id === currentAcademyId);
  const myRoleLabel = roleMap[role] || role;

  const handleAcceptInvitation = async (invitationId) => {
    if (acceptingId) return;
    setAcceptingId(invitationId);
    try {
      const result = await acceptInvitation(invitationId);
      const academyName = result?.academy?.name ?? '학원';
      showToast(`${academyName}에 참여했어요.`);
    } catch (err) {
      showToast(err?.message ?? '초대 수락에 실패했어요.', 'error');
    } finally {
      setAcceptingId(null);
    }
  };

  const workTitle = role === 'assistant' ? '담당 클리닉' : '담당 수업';
  const workIcon = role === 'assistant' ? Stethoscope : BookOpen;
  const workTab = role === 'assistant' ? 'clinic' : 'classes';

  return (
    <>
      {/* A. 내 프로필 */}
      <SectionTitle>내 프로필</SectionTitle>
      <div className="mx-4">
        <button
          type="button"
          onClick={onEditMyProfile}
          className="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-4 text-left active:bg-gray-50 border border-gray-100 shadow-sm"
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-base font-bold text-blue-600 flex-shrink-0">
            {(displayName || email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base truncate">
              {displayName || '이름을 등록해주세요'}
            </p>
            {email && <p className="text-xs text-gray-500 mt-0.5 truncate">{email}</p>}
            {phone && <p className="text-xs text-gray-400 mt-0.5 truncate">{phone}</p>}
          </div>
          <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
        </button>
      </div>

      {/* B. 소속 학원 */}
      <SectionTitle>소속 학원</SectionTitle>
      <div className="mx-4 flex flex-col gap-2">
        <div className="bg-white rounded-2xl px-4 py-3.5 border border-gray-100 shadow-sm flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Building2 size={16} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">
              {myMembership?.academy?.name || academyProfile?.name || '학원'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{myRoleLabel}</p>
          </div>
        </div>

        {showSwitchAcademy && (
          <SettingsRow
            icon={Building2}
            tone="blue"
            title="학원 전환"
            subtitle={`다른 학원으로 이동 (${memberships.length}개 소속)`}
            onClick={onSwitchAcademy}
          />
        )}

        {myPendingInvitations.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-50 flex items-center gap-2">
              <Inbox size={13} className="text-amber-600" />
              <p className="text-xs font-bold text-gray-700">받은 초대 ({myPendingInvitations.length})</p>
            </div>
            {myPendingInvitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 px-4 py-3 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {inv.academy?.name || '학원'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{roleMap[inv.role] || inv.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAcceptInvitation(inv.id)}
                  disabled={acceptingId === inv.id}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-60"
                >
                  {acceptingId === inv.id ? '수락 중…' : '수락'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* C. 내 업무 */}
      <SectionTitle>내 업무</SectionTitle>
      <div className="mx-4 flex flex-col gap-2">
        <SettingsRow
          icon={CalendarClock}
          tone="blue"
          title="내 근무표"
          subtitle="이번 달 일정과 출/퇴근"
          onClick={() => setActiveTab('work')}
        />
        <SettingsRow
          icon={Wallet}
          tone="emerald"
          title="내 급여"
          subtitle="이번 달 급여 정보"
          onClick={() => setActiveTab('payroll')}
        />
        <SettingsRow
          icon={workIcon}
          title={workTitle}
          subtitle={role === 'assistant' ? '담당 클리닉으로 이동' : '담당 수업으로 이동'}
          onClick={() => setActiveTab(workTab)}
        />
      </div>

      {/* D. 계정 */}
      <SectionTitle>계정</SectionTitle>
      <div className="mx-4">
        <InlineLogoutButton />
      </div>
    </>
  );
}

// 단일 로그아웃 버튼 — 두 사용처 모두 동일.
function InlineLogoutButton() {
  const signOutUser = useAuthStore((s) => s.signOutUser);
  const isAuthLoading = useAuthStore((s) => s.isAuthLoading);
  const showToast = useAcademyStore((s) => s.showToast);

  const handle = async () => {
    try {
      await signOutUser();
      showToast('로그아웃되었어요.');
    } catch (err) {
      showToast(err?.message ?? '로그아웃에 실패했어요.', 'error');
    }
  };

  return (
    <SettingsRow
      icon={LogOut}
      title="로그아웃"
      onClick={handle}
      rightAdornment={
        isAuthLoading ? <Loader2 size={14} className="animate-spin text-gray-400" /> : <span />
      }
    />
  );
}

// ─── 학원 정보 + 원장 프로필 통합 카드 (Phase 28 hotfix, owner More 전용) ──────
// 학원 이름 / 원장 이름 / 원장 이메일 / 원장 전화 한 카드에 보여주고,
// 학원 정보 수정과 내 프로필 수정 두 가지 진입점을 같이 제공한다.
function AcademyOwnerInfoCard({
  academyProfile, academyName, displayName, email, phone, onEditAcademy, onEditMyProfile,
}) {
  // Post-Phase 32 — 진짜 학원 이름 우선. academyProfile.name 의 기본값 '우리 학원'
  // 가 노출되지 않도록 academyName(memberships 기반) → academyProfile.name → '학원' 순서.
  const displayedAcademyName = academyName || academyProfile?.name || '학원';
  return (
    <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-sm">
      <button
        type="button"
        onClick={onEditAcademy}
        className="w-full flex items-center gap-3 text-left active:opacity-90"
      >
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">
          🏫
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-base truncate">{displayedAcademyName}</p>
          <p className="text-xs text-gray-500 mt-0.5">원장</p>
        </div>
        <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
      </button>

      <div className="mt-3 pt-3 border-t border-gray-50 flex flex-col gap-2">
        <InfoRow icon={UserCog} label="원장 이름" value={displayName} />
        <InfoRow icon={Mail} label="이메일" value={email} />
        <InfoRow icon={Phone} label="연락처" value={phone} placeholder="등록되지 않음" />
      </div>

      <button
        type="button"
        onClick={onEditMyProfile}
        className="mt-3 w-full py-2.5 rounded-xl bg-gray-50 text-gray-700 text-xs font-bold active:bg-gray-100"
      >
        내 프로필 수정
      </button>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, placeholder }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={13} className="text-gray-400 flex-shrink-0" />
      <span className="text-xs text-gray-500 flex-shrink-0 w-16">{label}</span>
      <span className={`text-xs flex-1 min-w-0 truncate ${value ? 'text-gray-800' : 'text-gray-400'}`}>
        {value || placeholder || '—'}
      </span>
    </div>
  );
}

// ─── StaffNotFound ───────────────────────────────────────────────
function StaffNotFound({ label, onBack }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="text-5xl mb-4">😕</div>
      <p className="text-base font-bold text-gray-800 mb-2">{label} 정보를 찾을 수 없어요.</p>
      <p className="text-sm text-gray-500 mb-6">삭제되었거나 다른 역할의 데이터일 수 있어요.</p>
      <button type="button" onClick={onBack} className="px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl text-sm">
        목록으로 돌아가기
      </button>
    </div>
  );
}

// ─── 학원 프로필 수정 ────────────────────────────────────────────
function AcademyProfileModal({ profile, onClose, onSave }) {
  const [form, setForm] = useState({
    name:      profile?.name      || '',
    ownerName: profile?.ownerName || '',
    address:   profile?.address   || '',
    phone:     profile?.phone     || '',
  });
  return (
    <Modal isOpen onClose={onClose} title="학원 정보 수정"
      footer={<button type="button" onClick={() => onSave(form)} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl">저장</button>}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">학원 이름</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="우리 학원" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">원장 이름</label>
          <input value={form.ownerName} onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))} placeholder="예: 김원장" className="input" />
          <p className="text-xs text-gray-400 mt-1.5">반의 담당 강사 선택 시 원장 본인을 배정할 수 있어요.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">주소</label>
          <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="서울시 강남구..." className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">연락처</label>
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))} placeholder="02-0000-0000" className="input" />
        </div>
      </div>
    </Modal>
  );
}

// ─── 강사 폼 ────────────────────────────────────────────────────
function TeacherFormModal({ initialData, onClose, onSave }) {
  const [form, setForm] = useState({
    name:          initialData?.name || '',
    phone:         initialData?.phone || '',
    email:         initialData?.email || '',
    subjects:      Array.isArray(initialData?.subjects) ? initialData.subjects : [],
    wageType:      initialData?.wageType || 'hourly',
    // Phase 34 — 시급 정산 기준: shiftHours (학원 머문 시간 · 추천) / lessonHours (수업 시간만)
    hourlyMode:    initialData?.hourlyMode || 'shiftHours',
    hourlyWage:    initialData?.hourlyWage ? String(initialData.hourlyWage) : '',
    monthlySalary: initialData?.monthlySalary ? String(initialData.monthlySalary) : (initialData?.monthlyWage ? String(initialData.monthlyWage) : ''),
    memo:          initialData?.memo || '',
    status:        'active',
    inviteStatus:  initialData?.inviteStatus || null,
  });

  const toggle = (key, val) => setForm((f) => ({
    ...f,
    [key]: f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val],
  }));

  const handleSave = () => {
    if (!form.name.trim()) return alert('이름을 입력해주세요.');
    onSave({
      ...form,
      email: (form.email || '').trim().toLowerCase() || null,
      hourlyWage: Number(form.hourlyWage) || 0,
      monthlySalary: Number(form.monthlySalary) || 0,
    });
  };

  return (
    <Modal isOpen onClose={onClose} title={initialData ? '강사 수정' : '강사 추가'}
      footer={<button type="button" onClick={handleSave} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl">저장</button>}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">이름 *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="홍강사" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">연락처</label>
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))} placeholder="010-0000-0000" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">담당 과목</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button key={s} type="button" onClick={() => toggle('subjects', s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${form.subjects.includes(s) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">급여 방식</label>
          <div className="grid grid-cols-2 gap-2">
            {WAGE_TYPES.map((w) => (
              <button key={w.id} type="button" onClick={() => setForm((f) => ({ ...f, wageType: w.id }))}
                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${form.wageType === w.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                {w.label}
              </button>
            ))}
          </div>
          {form.wageType === 'hourly' && (
            <>
              <input type="number" value={form.hourlyWage} onChange={(e) => setForm((f) => ({ ...f, hourlyWage: e.target.value }))} placeholder="시급 (원)" className="input mt-2" />
              <HourlyModeChoice
                value={form.hourlyMode}
                onChange={(v) => setForm((f) => ({ ...f, hourlyMode: v }))}
              />
            </>
          )}
          {form.wageType === 'monthly' && (
            <input type="number" value={form.monthlySalary} onChange={(e) => setForm((f) => ({ ...f, monthlySalary: e.target.value }))} placeholder="월급 (원)" className="input mt-2" />
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
          <textarea value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} rows={2} placeholder="특이사항 등" className="input resize-none" />
        </div>

        {/* 계정 연결 / 초대 — Supabase 로그인 + 학원 선택 상태에서만 실제 동작 */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-bold text-gray-500 mb-3">서버 계정 연결</p>
          <StaffInviteWidget
            role="teacher"
            initialEmail={form.email}
            onEmailChange={(value) => setForm((f) => ({ ...f, email: value }))}
            onInviteSent={({ status }) => setForm((f) => ({ ...f, inviteStatus: status }))}
          />
        </div>
      </div>
    </Modal>
  );
}

// Phase 34 — 시급 정산 기준 선택 (radio card)
function HourlyModeChoice({ value, onChange }) {
  const OPTIONS = [
    {
      id: 'shiftHours',
      title: '학원에 머문 시간 기준',
      subtitle: '추천 · 수업이 없어도 출퇴근 시간 전체를 정산해요.',
    },
    {
      id: 'lessonHours',
      title: '수업 시간만 정산',
      subtitle: '공강을 제외하고 실제 수업한 시간만 정산해요.',
    },
  ];
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-[11px] font-semibold text-gray-500">급여 정산 방식</p>
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`w-full text-left rounded-2xl px-4 py-3 border-2 transition-colors ${
              active ? 'border-[#0064FF] bg-blue-50' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-start gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                active ? 'border-[#0064FF] bg-[#0064FF]' : 'border-gray-300'
              }`}>
                {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${active ? 'text-[#0064FF]' : 'text-gray-800'}`}>
                  {opt.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{opt.subtitle}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── 보조강사 폼 ─────────────────────────────────────────────────
function AssistantFormModal({ initialData, onClose, onSave }) {
  const [form, setForm] = useState({
    name:          initialData?.name || '',
    phone:         initialData?.phone || '',
    email:         initialData?.email || '',
    subjects:      Array.isArray(initialData?.subjects)  ? initialData.subjects  : [],
    wageType:      initialData?.wageType || 'hourly',
    hourlyMode:    initialData?.hourlyMode || 'shiftHours',
    hourlyWage:    initialData?.hourlyWage    ? String(initialData.hourlyWage)    : '',
    monthlySalary: initialData?.monthlySalary ? String(initialData.monthlySalary) : '',
    memo:          initialData?.memo || '',
    status:        'active',
    inviteStatus:  initialData?.inviteStatus || null,
  });

  const toggle = (key, val) => setForm((f) => ({
    ...f,
    [key]: f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val],
  }));

  const handleSave = () => {
    if (!form.name.trim()) return alert('이름을 입력해주세요.');
    onSave({
      ...form,
      email: (form.email || '').trim().toLowerCase() || null,
      hourlyWage: Number(form.hourlyWage) || 0,
      monthlySalary: Number(form.monthlySalary) || 0,
    });
  };

  return (
    <Modal isOpen onClose={onClose} title={initialData ? '보조강사 수정' : '보조강사 추가'}
      footer={<button type="button" onClick={handleSave} className="w-full bg-purple-600 text-white font-bold py-3.5 rounded-xl">저장</button>}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">이름 *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="홍보조" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">연락처</label>
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))} placeholder="010-0000-0000" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">담당 과목</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button key={s} type="button" onClick={() => toggle('subjects', s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${form.subjects.includes(s) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">급여 방식</label>
          <div className="grid grid-cols-2 gap-2">
            {WAGE_TYPES.map((w) => (
              <button key={w.id} type="button" onClick={() => setForm((f) => ({ ...f, wageType: w.id }))}
                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${form.wageType === w.id ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                {w.label}
              </button>
            ))}
          </div>
          {form.wageType === 'hourly' && (
            <>
              <input type="number" value={form.hourlyWage} onChange={(e) => setForm((f) => ({ ...f, hourlyWage: e.target.value }))} placeholder="시급 (원)" className="input mt-2" />
              <HourlyModeChoice
                value={form.hourlyMode}
                onChange={(v) => setForm((f) => ({ ...f, hourlyMode: v }))}
              />
            </>
          )}
          {form.wageType === 'monthly' && (
            <input type="number" value={form.monthlySalary} onChange={(e) => setForm((f) => ({ ...f, monthlySalary: e.target.value }))} placeholder="월급 (원)" className="input mt-2" />
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
          <textarea value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} rows={2} placeholder="특이사항 등" className="input resize-none" />
        </div>

        {/* 계정 연결 / 초대 — Supabase 로그인 + 학원 선택 상태에서만 실제 동작 */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-bold text-gray-500 mb-3">서버 계정 연결</p>
          <StaffInviteWidget
            role="assistant"
            initialEmail={form.email}
            onEmailChange={(value) => setForm((f) => ({ ...f, email: value }))}
            onInviteSent={({ status }) => setForm((f) => ({ ...f, inviteStatus: status }))}
          />
        </div>
      </div>
    </Modal>
  );
}
