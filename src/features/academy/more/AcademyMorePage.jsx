import { useMemo, useState } from 'react';
import { LogOut, Plus, Trash2, AlertTriangle, ChevronRight, RotateCcw, ChevronLeft, Pencil, ClipboardCheck } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import { roleMap, formatPhoneNumber } from '../../../utils/format';
import { WAGE_TYPE_LABELS } from '../../../constants/labels';
import AuthSection from '../../auth/AuthSection';
import WorkspaceSection from '../../workspace/WorkspaceSection';
import PilotChecklistModal from './PilotChecklistModal';
import StaffInviteWidget from './StaffInviteWidget';
import ProfileEditModal from '../../workspace/ProfileEditModal';
import DangerZoneSection from './DangerZoneSection';
import AcademyStaffMembersSection from './AcademyStaffMembersSection';
import RekeyStaffModal from './RekeyStaffModal';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { UserCog, Building2 } from 'lucide-react';
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

        {/* 진단 + rekey — Phase 24 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 mb-3">서버 연결 / 배정</p>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-gray-500">서버 연결</span>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              teacher.source === 'server' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {teacher.source === 'server' ? '연결됨' : '로컬'}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-t border-gray-50">
            <span className="text-sm text-gray-500">로컬 id</span>
            <span className="text-xs font-mono text-gray-700 truncate ml-2">{teacher.id}</span>
          </div>
          {teacher.serverUserId && (
            <div className="flex items-center justify-between py-1.5 border-t border-gray-50">
              <span className="text-sm text-gray-500">서버 사용자 id</span>
              <span className="text-xs font-mono text-gray-700 truncate ml-2">{teacher.serverUserId.slice(0, 8)}…</span>
            </div>
          )}
          <div className="flex items-center justify-between py-1.5 border-t border-gray-50">
            <span className="text-sm text-gray-500">배정된 반 / 수업 회차</span>
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

        {/* 진단 + rekey — Phase 24 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-gray-400 mb-3">서버 연결 / 배정</p>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-gray-500">서버 연결</span>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              assistant.source === 'server' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {assistant.source === 'server' ? '연결됨' : '로컬'}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-t border-gray-50">
            <span className="text-sm text-gray-500">로컬 id</span>
            <span className="text-xs font-mono text-gray-700 truncate ml-2">{assistant.id}</span>
          </div>
          {assistant.serverUserId && (
            <div className="flex items-center justify-between py-1.5 border-t border-gray-50">
              <span className="text-sm text-gray-500">서버 사용자 id</span>
              <span className="text-xs font-mono text-gray-700 truncate ml-2">{assistant.serverUserId.slice(0, 8)}…</span>
            </div>
          )}
          <div className="flex items-center justify-between py-1.5 border-t border-gray-50">
            <span className="text-sm text-gray-500">배정된 클리닉 업무</span>
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
  const {
    role, logout,
    academyProfile, setAcademyProfile,
    academyTeachers, addTeacher, updateTeacher, deleteTeacher,
    academyAssistants, addAssistant, updateAssistant, deleteAssistant,
    classGroups, classSessions, clinicTasks,
    resetAcademyData, generateAcademySampleData,
    showToast,
  } = useAcademyStore();

  // 뷰 모드 상태 — ID만 보관, 스냅샷 금지
  const [viewTeacherId, setViewTeacherId]       = useState(null);
  const [viewAssistantId, setViewAssistantId]   = useState(null);
  const [teacherFormOpen, setTeacherFormOpen]   = useState(false);
  const [assistantFormOpen, setAssistantFormOpen] = useState(false);
  const [isNewTeacher, setIsNewTeacher]         = useState(false);
  const [isNewAssistant, setIsNewAssistant]     = useState(false);
  const [showProfileEdit, setShowProfileEdit]   = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showPilotChecklist, setShowPilotChecklist] = useState(false);
  const [showUserProfileEdit, setShowUserProfileEdit] = useState(false);
  const [rekeyContext, setRekeyContext] = useState(null); // { kind, staff } | null

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userProfile = useWorkspaceStore((s) => s.profile);
  const academyMemberProfiles = useWorkspaceStore((s) => s.academyMemberProfiles);
  const memberships = useWorkspaceStore((s) => s.memberships);

  const isOwner = role === 'owner';
  // Phase 28: staff(강사/보조강사) 가 여러 학원에 속할 때만 "학원 전환" 버튼 노출.
  const isStaff = role === 'teacher' || role === 'assistant';
  const showSwitchAcademy = isStaff && memberships.length > 1;

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
  const openTeacherAdd     = ()    => { setIsNewTeacher(true);  setViewTeacherId(null); setTeacherFormOpen(true); };
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
  const openAssistantAdd     = ()   => { setIsNewAssistant(true);  setViewAssistantId(null); setAssistantFormOpen(true); };
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
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div>
      <Header title="더보기" />
      <div className="pt-14 pb-6">

        {/* 학원 프로필 */}
        <button
          type="button"
          onClick={() => isOwner && setShowProfileEdit(true)}
          className="mx-4 mt-4 w-[calc(100%-2rem)] bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left active:scale-[0.97] transition-transform"
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">
            🏫
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900">{academyProfile?.name || '학원'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{roleMap[role]}</p>
            {academyProfile?.phone && <p className="text-xs text-gray-400 mt-0.5">{academyProfile.phone}</p>}
          </div>
          {isOwner && <ChevronRight size={16} className="text-gray-300" />}
        </button>

        {/* 서버 계정 (선택 사항) */}
        <AuthSection />

        {/* 학원 워크스페이스 */}
        <WorkspaceSection />

        {/* Phase 28: staff (강사/보조강사) 가 여러 학원에 소속된 경우 학원 전환 버튼. */}
        {showSwitchAcademy && (
          <div className="mx-4 mt-5">
            <button
              type="button"
              onClick={handleSwitchAcademy}
              className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3.5 text-left active:bg-gray-50 shadow-sm"
            >
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Building2 size={16} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">학원 전환</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  다른 학원으로 이동해요 ({memberships.length}개 소속)
                </p>
              </div>
              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
            </button>
          </div>
        )}

        {/* 내 프로필 — 로그인 상태에서만 표시. 모든 역할(원장/강사/보조강사) 공통 */}
        {isAuthenticated && (
          <div className="mx-4 mt-5">
            <button
              type="button"
              onClick={() => setShowUserProfileEdit(true)}
              className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3.5 text-left active:bg-gray-50 shadow-sm"
            >
              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <UserCog size={16} className="text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">
                  {userProfile?.display_name || '내 프로필'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {userProfile?.phone || '연락처를 등록해두면 더 편해요.'}
                </p>
              </div>
              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
            </button>
          </div>
        )}

        {/* 구성원 관리 — 원장 전용. 학원 멤버 + 강사/보조강사 통합 (Phase 28) */}
        {isOwner && <AcademyStaffMembersSection />}

        {/* 강사 관리 */}
        {isOwner && (
          <div className="mx-4 mt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-700">강사 관리</p>
              <button type="button" onClick={openTeacherAdd}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
                <Plus size={12} />추가
              </button>
            </div>
            {academyTeachers.length === 0 ? (
              <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
                <p className="text-sm text-gray-400">등록된 강사가 없어요</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {academyTeachers.map((raw) => {
                  const t = normalizeTeacher(raw);
                  const linked = isLocalStaffLinked(t) || t.source === 'server';
                  const counts = teacherAssignmentCounts.get(t.id) || { groups: 0, sessions: 0 };
                  return (
                    <button type="button" key={t.id} onClick={() => openTeacherDetail(t.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 text-left active:bg-gray-50">
                      <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-600 flex-shrink-0">
                        {t.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                          {linked && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                              참여 중
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {t.subjects.join(', ')}{t.subjects.length > 0 ? ' · ' : ''}{wageLabel(t.wageType)}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                          반 {counts.groups} · 회차 {counts.sessions}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 보조강사 관리 */}
        {isOwner && (
          <div className="mx-4 mt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-700">보조강사 관리</p>
              <button type="button" onClick={openAssistantAdd}
                className="flex items-center gap-1 text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full">
                <Plus size={12} />추가
              </button>
            </div>
            {academyAssistants.length === 0 ? (
              <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
                <p className="text-sm text-gray-400">등록된 보조강사가 없어요</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {academyAssistants.map((raw) => {
                  const a = normalizeAssistant(raw);
                  const subjects = a.subjects.join(' · ');
                  const wage = a.wageType === 'monthly'
                    ? `월급 ${(a.monthlySalary || 0).toLocaleString()}원`
                    : `시급 ${(a.hourlyWage || 0).toLocaleString()}원`;
                  const linked = isLocalStaffLinked(a) || a.source === 'server';
                  const taskCount = assistantAssignmentCounts.get(a.id) || 0;
                  return (
                    <button type="button" key={a.id} onClick={() => openAssistantDetail(a.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 text-left active:bg-gray-50">
                      <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0">
                        {a.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-gray-900 text-sm">{a.name}</p>
                          {linked && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                              참여 중
                            </span>
                          )}
                        </div>
                        {subjects && <p className="text-xs text-gray-500 mt-0.5 truncate">{subjects}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{wage}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                          클리닉 {taskCount}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 데이터 관리 (원장만) — 샘플 데이터 / 파일럿 체크리스트는 Phase 28 에서 제거.
            "이 기기 데이터 초기화" 는 캐시 비우기 용도로 유지. */}
        {isOwner && (
          <div className="mx-4 mt-5">
            <p className="text-sm font-bold text-gray-700 mb-3">데이터 관리</p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => setShowResetConfirm(true)}
                className="w-full flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3.5 text-left active:bg-gray-50">
                <Trash2 size={16} className="text-gray-500" />
                <div>
                  <p className="text-sm font-bold text-gray-700">이 기기 캐시 초기화</p>
                  <p className="text-xs text-gray-400 mt-0.5">이 기기에 저장된 임시 데이터만 비워요. 학원 데이터는 그대로 유지돼요.</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Danger Zone — 원장 본인 + currentAcademy 가 있을 때만 표시 */}
        <DangerZoneSection />

        {/* Phase 28: "역할 변경" 버튼 제거. 로그아웃은 위 계정 카드(AuthSection) 에서.
            여러 학원을 가진 강사/보조강사는 아래 "학원 전환" 으로 전환. */}
        <div className="mx-4 mt-5 hidden">
          <button type="button" onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white shadow-sm text-gray-600 text-sm font-medium">
            <LogOut size={16} />
            역할 변경
          </button>
        </div>
      </div>

      {/* 강사 추가 폼 (목록 뷰에서 열림) */}
      {teacherFormOpen && isNewTeacher && (
        <TeacherFormModal initialData={null} onClose={closeTeacherForm} onSave={handleSaveTeacher} />
      )}

      {/* 보조강사 추가 폼 (목록 뷰에서 열림) */}
      {assistantFormOpen && isNewAssistant && (
        <AssistantFormModal initialData={null} onClose={closeAssistantForm} onSave={handleSaveAssistant} />
      )}

      {/* 학원 프로필 수정 */}
      {showProfileEdit && (
        <AcademyProfileModal
          profile={academyProfile}
          onClose={() => setShowProfileEdit(false)}
          onSave={(data) => { setAcademyProfile(data); showToast('학원 정보가 저장되었습니다.'); setShowProfileEdit(false); }}
        />
      )}

      {/* 파일럿 테스트 체크리스트 모달 */}
      <PilotChecklistModal
        isOpen={showPilotChecklist}
        onClose={() => setShowPilotChecklist(false)}
      />

      {/* 내 프로필 수정 모달 */}
      <ProfileEditModal
        isOpen={showUserProfileEdit}
        onClose={() => setShowUserProfileEdit(false)}
      />

      {/* 이 기기 데이터 초기화 확인 (localStorage 만) */}
      <Modal isOpen={showResetConfirm} onClose={() => setShowResetConfirm(false)} title="이 기기 데이터 초기화"
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowResetConfirm(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">취소</button>
            <button type="button" onClick={() => { resetAcademyData(); setShowResetConfirm(false); }} className="flex-1 py-3.5 rounded-xl bg-red-500 text-white text-sm font-bold">초기화</button>
          </div>
        }
      >
        <div className="bg-red-50 rounded-2xl px-4 py-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 mb-1">이 기기의 학원 localStorage 만 비웁니다</p>
            <p className="text-xs text-red-500">서버 데이터는 그대로 유지돼요. 다시 “서버 데이터 불러오기”로 복원할 수 있어요.</p>
          </div>
        </div>
      </Modal>
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
            <input type="number" value={form.hourlyWage} onChange={(e) => setForm((f) => ({ ...f, hourlyWage: e.target.value }))} placeholder="시급 (원)" className="input mt-2" />
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

// ─── 보조강사 폼 ─────────────────────────────────────────────────
function AssistantFormModal({ initialData, onClose, onSave }) {
  const [form, setForm] = useState({
    name:          initialData?.name || '',
    phone:         initialData?.phone || '',
    email:         initialData?.email || '',
    subjects:      Array.isArray(initialData?.subjects)  ? initialData.subjects  : [],
    wageType:      initialData?.wageType || 'hourly',
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
            <input type="number" value={form.hourlyWage} onChange={(e) => setForm((f) => ({ ...f, hourlyWage: e.target.value }))} placeholder="시급 (원)" className="input mt-2" />
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
