import { useMemo } from 'react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { today, formatDateShort, greetingByTime, getDDay } from '../../../utils/date';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import MyTodayShiftCard from './MyTodayShiftCard';
import MyPayrollCard from './MyPayrollCard';
import StaffHomeQrButton from './StaffHomeQrButton';

const CLINIC_TYPE_LABELS = {
  homework: '숙제', wrong_answer: '오답', vocabulary: '단어', reading: '본문',
  grammar: '문법', concept: '개념', test_retry: '재시험', absence_makeup: '보강', other: '기타',
};

const STATUS_CONFIG = {
  pending:     { label: '대기',    color: 'bg-orange-50 text-orange-600' },
  in_progress: { label: '진행 중', color: 'bg-blue-50 text-blue-600' },
  completed:   { label: '완료',    color: 'bg-green-50 text-green-600' },
  hold:        { label: '보류',    color: 'bg-gray-100 text-gray-500' },
};

const PRIORITY_CONFIG = {
  urgent: { label: '긴급', color: 'bg-red-100 text-red-600' },
  high:   { label: '높음', color: 'bg-orange-50 text-orange-600' },
  normal: { label: '일반', color: 'bg-gray-100 text-gray-500' },
  low:    { label: '낮음', color: 'bg-gray-50 text-gray-400' },
};

export default function AssistantDashboard() {
  const academyStudents = useAcademyStore((s) => s.academyStudents);
  const classGroups = useAcademyStore((s) => s.classGroups);
  const clinicTasks = useAcademyStore((s) => s.clinicTasks);
  const academyAssistants = useAcademyStore((s) => s.academyAssistants);
  const completeClinicTask = useAcademyStore((s) => s.completeClinicTask);
  const updateClinicTask = useAcademyStore((s) => s.updateClinicTask);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const academyPayrolls = useAcademyStore((s) => s.academyPayrolls) ?? [];
  const todayStr = today();
  const currentMonth = todayStr.slice(0, 7);

  // Phase 25 — 본인 보조강사 식별. 매칭 실패 시 빈 화면 안내.
  const authUserId = useAuthStore((s) => s.user?.id);
  const authUserEmail = useAuthStore((s) => s.user?.email);
  const memberships = useWorkspaceStore((s) => s.memberships);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const myMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );
  const myAssistant = useMemo(
    () => findLocalStaffForUser(academyAssistants, {
      userId: authUserId,
      memberId: myMembership?.id,
      email: authUserEmail,
    }),
    [academyAssistants, authUserId, myMembership?.id, authUserEmail],
  );

  // 내 클리닉만 필터 — assignedToId 가 내 id 와 일치하는 항목.
  const myClinicTasks = useMemo(() => {
    if (!myAssistant) return [];
    return clinicTasks.filter((t) => t.assignedToId === myAssistant.id);
  }, [clinicTasks, myAssistant]);

  const pendingClinics = useMemo(
    () => myClinicTasks.filter((t) => t.status === 'pending').sort((a, b) => {
      const pri = { urgent: 0, high: 1, normal: 2, low: 3 };
      return (pri[a.priority] ?? 2) - (pri[b.priority] ?? 2);
    }),
    [myClinicTasks]
  );

  const inProgressClinics = useMemo(
    () => myClinicTasks.filter((t) => t.status === 'in_progress'),
    [myClinicTasks]
  );

  const todayDueClinics = useMemo(
    () => myClinicTasks.filter((t) => t.dueDate === todayStr && t.status !== 'completed'),
    [myClinicTasks, todayStr]
  );

  const urgentClinics = useMemo(
    () => myClinicTasks.filter((t) => t.priority === 'urgent' && t.status !== 'completed'),
    [myClinicTasks]
  );

  const completedToday = useMemo(
    () => myClinicTasks.filter((t) => t.completedAt?.startsWith(todayStr)),
    [myClinicTasks, todayStr]
  );

  // Phase 32 — 내 급여 (이번 달)
  const myPayroll = useMemo(() => {
    if (!myAssistant) return null;
    return academyPayrolls.find(
      (p) => p.month === currentMonth && p.staffType === 'assistant' && p.staffId === myAssistant.id,
    ) || null;
  }, [academyPayrolls, currentMonth, myAssistant]);

  return (
    <div className="pt-6 pb-4">
      <div className="px-5 mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-gray-500 text-sm">{greetingByTime()}</p>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5">오늘 클리닉</h2>
            <p className="text-sm text-gray-400 mt-0.5">{formatDateShort(todayStr)}</p>
          </div>
          <StaffHomeQrButton staff={myAssistant} />
        </div>
      </div>

      {/* Phase 31 — 오늘 근무 카드 + 출/퇴근 */}
      <MyTodayShiftCard staff={myAssistant} staffRole="assistant" />

      {!myAssistant && (
        <div className="mx-4 mb-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="font-bold text-gray-900 mb-1">아직 배정된 클리닉이 없어요</p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              계정과 연결된 보조강사 정보가 없어요.<br />
              원장이 보조강사로 등록하면 여기에 클리닉이 표시됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 요약 카드 */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-5">
        <SummaryCard
          label="대기"
          value={`${pendingClinics.length}건`}
          color={pendingClinics.length > 0 ? 'text-orange-500' : 'text-gray-900'}
          onClick={() => setActiveTab('clinic')}
        />
        <SummaryCard
          label="진행 중"
          value={`${inProgressClinics.length}건`}
          color={inProgressClinics.length > 0 ? 'text-blue-600' : 'text-gray-900'}
          onClick={() => setActiveTab('clinic')}
        />
        <SummaryCard
          label="오늘 마감"
          value={`${todayDueClinics.length}건`}
          color={todayDueClinics.length > 0 ? 'text-red-500' : 'text-gray-900'}
          onClick={() => setActiveTab('clinic')}
        />
        <SummaryCard
          label="오늘 완료"
          value={`${completedToday.length}건`}
          color="text-green-600"
        />
      </div>

      {/* Phase 32 — 내 급여 (이번 달) */}
      <MyPayrollCard
        role="assistant"
        myPayroll={myPayroll}
        myStaffProfile={myAssistant}
        onOpen={() => setActiveTab('payroll')}
      />

      {/* 긴급 클리닉 */}
      {urgentClinics.length > 0 && (
        <div className="px-4 mb-5">
          <p className="text-sm font-bold text-red-600 mb-2">🚨 긴급 처리 필요</p>
          <div className="flex flex-col gap-2">
            {urgentClinics.map((task) => (
              <ClinicCard key={task.id} task={task} students={academyStudents} classGroups={classGroups}
                onStart={() => updateClinicTask(task.id, { status: 'in_progress' })}
                onComplete={() => completeClinicTask(task.id, '')}
              />
            ))}
          </div>
        </div>
      )}

      {/* 오늘 처리할 클리닉 */}
      <div className="px-4 mb-5">
        <p className="text-sm font-bold text-gray-700 mb-3">오늘 처리할 클리닉</p>
        {pendingClinics.length === 0 && inProgressClinics.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <p className="text-2xl mb-2">✅</p>
            <p className="text-sm font-semibold text-gray-700">처리할 클리닉이 없어요!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {[...inProgressClinics, ...pendingClinics].slice(0, 5).map((task) => (
              <ClinicCard key={task.id} task={task} students={academyStudents} classGroups={classGroups}
                onStart={() => updateClinicTask(task.id, { status: 'in_progress' })}
                onComplete={() => completeClinicTask(task.id, '')}
              />
            ))}
          </div>
        )}

        {(pendingClinics.length + inProgressClinics.length) > 5 && (
          <button
            onClick={() => setActiveTab('clinic')}
            className="w-full mt-3 py-3 rounded-2xl border-2 border-dashed border-blue-200 text-blue-600 text-sm font-semibold"
          >
            전체 클리닉 보기 ({pendingClinics.length + inProgressClinics.length}건)
          </button>
        )}
      </div>
    </div>
  );
}

function ClinicCard({ task, students, classGroups, onStart, onComplete }) {
  const student = students.find((s) => s.id === task.studentId);
  const group = classGroups.find((g) => g.id === task.classGroupId);
  const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;
  const dday = getDDay(task.dueDate);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priority.color}`}>{priority.label}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
            {CLINIC_TYPE_LABELS[task.type] || '기타'}
          </span>
        </div>
        {dday !== null && dday <= 3 && (
          <span className={`text-xs font-bold ${dday === 0 ? 'text-red-600' : dday <= 1 ? 'text-orange-500' : 'text-amber-500'}`}>
            {dday === 0 ? 'D-Day' : `D-${dday}`}
          </span>
        )}
      </div>
      <p className="font-semibold text-gray-900 text-sm">{student?.name || '학생'} · {task.title}</p>
      {group && <p className="text-xs text-gray-400 mt-0.5">{group.name}</p>}
      {task.description && <p className="text-xs text-gray-500 mt-1">{task.description}</p>}

      <div className="flex gap-2 mt-3">
        {task.status === 'pending' && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onStart}
            className="flex-1 bg-blue-600 text-white text-xs font-bold py-2 rounded-xl"
          >
            진행 시작
          </motion.button>
        )}
        {task.status === 'in_progress' && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onComplete}
            className="flex-1 bg-green-500 text-white text-xs font-bold py-2 rounded-xl"
          >
            완료 처리
          </motion.button>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color = 'text-gray-900', onClick }) {
  return (
    <button onClick={onClick} className="bg-white rounded-2xl p-4 shadow-sm text-left w-full active:scale-[0.97] transition-transform">
      <p className="text-xs text-gray-500 mb-1 font-medium">{label}</p>
      <p className={`text-2xl font-bold leading-none ${color}`}>{value}</p>
    </button>
  );
}
