import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, ChevronRight, Check, CheckSquare } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  getKoreaMinutes,
  getWeekDates,
  today,
  formatDateShort,
  greetingByTime,
} from '../../../utils/date';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import MyTodayShiftCard from './MyTodayShiftCard';
import MyPayrollCard from './MyPayrollCard';
import StaffHomeQrButton from './StaffHomeQrButton';
import ClinicRecordFormModal from '../clinic/ClinicRecordFormModal';

// "방금 끝난 수업" 윈도우 — 종료 후 이 시간(분) 이내 수업을 홈 상단에 우선 노출.
const JUST_FINISHED_WINDOW_MIN = 120;

function parseHHmmToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatClock(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function endedAgoLabel(minutesAgo) {
  if (minutesAgo <= 0) return '방금 종료';
  if (minutesAgo < 60) return `${minutesAgo}분 전 종료`;
  const h = Math.floor(minutesAgo / 60);
  const m = minutesAgo % 60;
  return m === 0 ? `${h}시간 전 종료` : `${h}시간 ${m}분 전 종료`;
}

export default function AssistantDashboard() {
  const academyStudents = useAcademyStore((s) => s.academyStudents);
  const classGroups = useAcademyStore((s) => s.classGroups);
  const classSessions = useAcademyStore((s) => s.classSessions);
  const academyLessonRecords = useAcademyStore((s) => s.academyLessonRecords) ?? [];
  const clinicRecords = useAcademyStore((s) => s.clinicRecords) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const academyPayrolls = useAcademyStore((s) => s.academyPayrolls) ?? [];
  const todayStr = today();
  const currentMonth = todayStr.slice(0, 7);

  // Phase 25 — 본인 보조강사 식별. 매칭 실패 시 빈 화면 안내.
  const authUserId = useAuthStore((s) => s.user?.id);
  const authUserEmail = useAuthStore((s) => s.user?.email);
  const memberships = useWorkspaceStore((s) => s.memberships);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const academyMemberProfiles = useWorkspaceStore((s) => s.academyMemberProfiles) ?? [];
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const myMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );
  // 본인 보조강사 신원.
  //   1) 로컬 미러(academyAssistants) 가 있으면 그대로 사용.
  //   2) 미러가 아직 없을 때 (보조강사 본인은 다른 멤버 프로필 로드 권한이
  //      제한돼 syncLocalStaffFromServerMembers 가 비어 있을 수 있다) → auth +
  //      멤버/스태프 프로필로 최소 신원을 합성한다. id 는 미러 stableId 와 동일한
  //      `assistant_${userId}` 포맷이라 미러가 나중에 로드돼도 충돌하지 않는다.
  //      세션 매칭은 assistantUserIds(서버 user_id) 경로로 별도 동작한다.
  const myAssistant = useMemo(() => {
    const matched = findLocalStaffForUser(academyAssistants, {
      userId: authUserId,
      memberId: myMembership?.id,
      email: authUserEmail,
    });
    if (matched) return matched;
    if (!authUserId) return null;
    const staffProfile = academyStaffProfiles.find((sp) => sp.user_id === authUserId) || null;
    const memberProfile = academyMemberProfiles.find((mp) => mp.user_id === authUserId) || null;
    return {
      id: `assistant_${authUserId}`,
      serverUserId: authUserId,
      academyMemberId: myMembership?.id || staffProfile?.member_id || null,
      email: authUserEmail || memberProfile?.email || null,
      name: memberProfile?.display_name || authUserEmail || '보조강사',
      role: 'assistant',
      permissions: staffProfile?.permissions,
      status: staffProfile?.status || 'active',
      source: 'fallback',
    };
  }, [academyAssistants, authUserId, myMembership?.id, authUserEmail, academyStaffProfiles, academyMemberProfiles]);

  // 1분마다 갱신 — "방금 끝난 수업" 윈도우 통과/이탈 자동 반영.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 학생 탭 → 클리닉 기록 폼 바로 열기. { studentId, session, group } 보관.
  const [clinicTarget, setClinicTarget] = useState(null);

  // 내가 배정된 반 — 세션 매칭 fallback. local id / server user_id 양쪽 지원.
  const myGroupIds = useMemo(() => {
    const set = new Set();
    classGroups.forEach((g) => {
      const byLocal = myAssistant && (g.assistantIds || []).includes(myAssistant.id);
      const byUser = authUserId && Array.isArray(g.assistantUserIds) && g.assistantUserIds.includes(authUserId);
      if (byLocal || byUser) set.add(g.id);
    });
    return set;
  }, [classGroups, myAssistant, authUserId]);

  // 내 담당 세션 — 세션 자체 배정 또는 반 배정으로 매칭.
  const myAssignedSessions = useMemo(() => {
    return classSessions.filter((s) => {
      if (s.status === 'canceled') return false;
      if (myAssistant && (s.assistantIds || []).includes(myAssistant.id)) return true;
      if (authUserId && Array.isArray(s.assistantUserIds) && s.assistantUserIds.includes(authUserId)) return true;
      return myGroupIds.has(s.classGroupId);
    });
  }, [classSessions, myAssistant, myGroupIds, authUserId]);

  // 특정 학생이 해당 세션에 대해 이미 클리닉 기록을 남겼는지.
  // 세션 직접 연결(classSessionId) 우선, 없으면 같은 날·같은 반 기록으로 fallback.
  const isStudentRecorded = (studentId, session) =>
    clinicRecords.some((r) =>
      r.studentId === studentId &&
      (r.classSessionId === session.id ||
        (r.date === session.date && session.classGroupId && r.classGroupId === session.classGroupId)),
    );

  // 홈 우선 노출 대상: 오늘 종료 후 2시간 이내 + 아직 기록이 남은 학생이 있는 세션.
  // 모든 학생 기록을 마친 세션은 우선 표시에서 제외한다.
  const justFinishedSessions = useMemo(() => {
    const nowMin = getKoreaMinutes(now);

    // 배정 세션이 하나도 없으면(배정 미설정 학원) 오늘 모든 세션을 후보로 사용.
    const pool = myAssignedSessions.length > 0
      ? myAssignedSessions
      : classSessions.filter((s) => s.status !== 'canceled');

    return pool
      .filter((s) => s.date === todayStr)
      .map((s) => {
        const endMin = parseHHmmToMinutes(s.endTime) ?? parseHHmmToMinutes(s.startTime);
        return { session: s, endMin };
      })
      .filter(({ endMin }) => {
        if (endMin === null) return false;
        const ago = nowMin - endMin;
        return ago >= 0 && ago <= JUST_FINISHED_WINDOW_MIN;
      })
      .map(({ session, endMin }) => {
        const studentIds = session.studentIds || [];
        const remaining = studentIds.filter((sid) => !isStudentRecorded(sid, session));
        return { session, endMin, minutesAgo: nowMin - endMin, remaining };
      })
      .filter(({ remaining }) => remaining.length > 0)
      .sort((a, b) => b.endMin - a.endMin);
  }, [myAssignedSessions, classSessions, todayStr, now, clinicRecords]);

  const remainingTotal = useMemo(
    () => justFinishedSessions.reduce((acc, s) => acc + s.remaining.length, 0),
    [justFinishedSessions],
  );

  // 요약 — 오늘/이번 주 클리닉 기록 수.
  const todayRecordCount = useMemo(
    () => clinicRecords.filter((r) => r.date === todayStr).length,
    [clinicRecords, todayStr],
  );
  const weekRecordCount = useMemo(() => {
    const weekDates = new Set(getWeekDates(todayStr));
    return clinicRecords.filter((record) => weekDates.has(record.date)).length;
  }, [clinicRecords, todayStr]);

  // Phase 32 — 내 급여 (이번 달)
  const myPayroll = useMemo(() => {
    if (!myAssistant) return null;
    return academyPayrolls.find(
      (p) => p.month === currentMonth && p.staffType === 'assistant' && p.staffId === myAssistant.id,
    ) || null;
  }, [academyPayrolls, currentMonth, myAssistant]);

  const buildRelayTarget = (studentId, session) => {
    const group = classGroups.find((g) => g.id === session.classGroupId) || null;
    const lessonRecord = academyLessonRecords.find((lr) => lr.sessionId === session.id && lr.studentId === studentId) || null;
    return {
      studentId,
      classGroupId: group?.id || '',
      classSessionId: session?.id || '',
      date: session?.date || todayStr,
      subject: group?.subject || '',
      sourceSupportTags: lessonRecord?.supportTags || [],
      sourceSupportMemo: lessonRecord?.supportMemo || '',
      sourceLessonRecordId: lessonRecord?.id || null,
    };
  };

  const openClinicForStudent = (studentId, session, relayStudentIds = [studentId]) => {
    const relayTargets = relayStudentIds.map((sid) => buildRelayTarget(sid, session));
    const initialRelayIndex = Math.max(0, relayStudentIds.findIndex((sid) => sid === studentId));
    setClinicTarget({ relayTargets, initialRelayIndex });
  };

  return (
    <div className="pt-6 pb-4">
      <div className="px-5 mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-seenit-muted text-sm">{greetingByTime()}</p>
            <h2 className="text-xl font-bold text-seenit-ink mt-0.5">클리닉 기록</h2>
            <p className="text-sm text-seenit-subtle mt-0.5">{formatDateShort(todayStr)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('attendance')}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-xs font-bold text-blue-700 sm:w-auto sm:gap-1.5 sm:px-3"
              aria-label="학생 등하원"
            >
              <CheckSquare size={14} />
              <span className="hidden sm:inline">등하원</span>
            </button>
            <StaffHomeQrButton staff={myAssistant} staffRole="assistant" />
          </div>
        </div>
      </div>

      {/* Phase 31 — 오늘 근무 카드 + 출/퇴근 */}
      <MyTodayShiftCard staff={myAssistant} staffRole="assistant" />

      {!myAssistant && (
        <div className="mx-4 mb-5">
          <div className="bg-seenit-surface rounded-2xl p-6 shadow-sm text-center">
            <div className="text-4xl mb-3">📋</div>
            <p className="font-bold text-seenit-ink mb-1">계정이 아직 연결되지 않았어요</p>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              계정과 연결된 보조강사 정보가 없어요.<br />
              원장이 보조강사로 등록하면 여기에 수업과 클리닉이 표시됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 방금 끝난 수업 — 클리닉 기록 우선 액션 (홈의 핵심) */}
      <div className="px-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-seenit-secondary">방금 끝난 수업</p>
          {remainingTotal > 0 && (
            <span className="text-xs font-bold text-orange-500">기록 필요 {remainingTotal}명</span>
          )}
        </div>

        {justFinishedSessions.length === 0 ? (
          <div className="bg-seenit-surface rounded-2xl px-4 py-6 text-center shadow-sm">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm font-semibold text-seenit-secondary">기록할 수업이 없어요</p>
            <p className="text-xs text-gray-400 mt-1">수업이 끝나면 학생들이 여기에 떠요.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {justFinishedSessions.map(({ session, minutesAgo, remaining }) => {
              const group = classGroups.find((g) => g.id === session.classGroupId);
              return (
                <div key={session.id} className="bg-seenit-surface rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-[#0064FF] flex-shrink-0" />
                    <span className="font-bold text-seenit-ink text-sm flex-1 min-w-0 truncate">
                      {group?.name || '수업'}
                    </span>
                    <span className="text-[11px] font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full flex-shrink-0">
                      {endedAgoLabel(minutesAgo)}
                    </span>
                  </div>

                  <p className="text-xs text-gray-400 mb-2">
                    {formatClock(session.startTime)}–{formatClock(session.endTime)} · 기록할 학생 {remaining.length}명
                  </p>

                  <div className="flex flex-col gap-1.5">
                    {remaining.map((sid) => {
                      const student = academyStudents.find((s) => s.id === sid);
                      return (
                        <motion.button
                          key={sid}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => openClinicForStudent(sid, session, remaining)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-seenit-elevated active:bg-seenit-brand-soft text-left transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-seenit-surface flex items-center justify-center flex-shrink-0 shadow-sm">
                            <ClipboardList size={14} className="text-[#0064FF]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-seenit-ink truncate">
                              {student?.name || '학생'}
                              {student?.grade ? <span className="text-xs text-gray-400 font-normal"> · {student.grade}</span> : null}
                            </p>
                          </div>
                          <span className="text-[11px] font-bold text-[#0064FF] flex-shrink-0">클리닉 기록</span>
                          <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-5">
        <SummaryCard
          label="오늘 클리닉 기록"
          value={`${todayRecordCount}건`}
          color={todayRecordCount > 0 ? 'text-[#0064FF]' : 'text-gray-900'}
          onClick={() => setActiveTab('clinic')}
        />
        <SummaryCard
          label="이번 주 기록"
          value={`${weekRecordCount}건`}
          onClick={() => setActiveTab('clinic')}
        />
      </div>

      {/* Phase 32 — 내 급여 (이번 달) */}
      <MyPayrollCard
        role="assistant"
        myPayroll={myPayroll}
        myStaffProfile={myAssistant}
        onOpen={() => setActiveTab('payroll')}
      />

      {/* 전체 클리닉 기록 보기 — 탭에서 제거된 ClinicPage 로 진입 */}
      <div className="px-4">
        <button
          type="button"
          onClick={() => setActiveTab('clinic')}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-seenit-surface shadow-sm active:scale-[0.98] transition-transform"
        >
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Check size={15} className="text-[#0064FF]" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-bold text-seenit-ink">전체 클리닉 기록 보기</p>
            <p className="text-xs text-gray-400 mt-0.5">지난 기록 확인 · 직접 추가</p>
          </div>
          <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
        </button>
      </div>

      {/* 클리닉 기록 폼 — 학생/수업/날짜/과목 자동 채움 */}
      {clinicTarget && (
        <ClinicRecordFormModal
          relayTargets={clinicTarget.relayTargets}
          initialRelayIndex={clinicTarget.initialRelayIndex}
          onClose={() => setClinicTarget(null)}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, color = 'text-seenit-ink', onClick }) {
  return (
    <button onClick={onClick} className="bg-seenit-surface rounded-2xl p-4 shadow-sm text-left w-full active:scale-[0.97] transition-transform">
      <p className="text-xs text-seenit-muted mb-1 font-medium">{label}</p>
      <p className={`text-2xl font-bold leading-none ${color}`}>{value}</p>
    </button>
  );
}
