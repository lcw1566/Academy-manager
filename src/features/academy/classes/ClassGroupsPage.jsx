import { useMemo } from 'react';
import { Plus, ChevronRight, Users, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import Header from '../../../components/Header';
import EmptyState from '../../../components/EmptyState';
import ClassGroupFormModal from './ClassGroupFormModal';
import { today, formatDateShort } from '../../../utils/date';
import { getTeacherDisplayName, OWNER_TEACHER_ID } from '../../../utils/format';
import { useState } from 'react';
import { currentUserCan } from '../../../utils/staffPermissions';
// Phase 44.6 / Phase B — 룰 기반 예정 세션 머지.
import {
  buildPlannedClassSessions,
  mergePlannedAndActualClassSessions,
  plannedToClassSessionShape,
} from '../../../utils/schedule';

const STATUS_MAP = {
  active:   { label: '운영 중', color: 'bg-green-50 text-green-700' },
  inactive: { label: '종료',   color: 'bg-gray-100 text-gray-500' },
  pending:  { label: '대기',   color: 'bg-yellow-50 text-yellow-700' },
};

export default function ClassGroupsPage() {
  const {
    role, classGroups, classSessions, academyStudents, academyTeachers, academyProfile,
    navigateToClassGroup,
  } = useAcademyStore();

  const [showForm, setShowForm] = useState(false);
  const todayStr = today();
  const isOwner = role === 'owner';

  // Phase 30 — canManageClasses 권한이 있으면 owner 가 아닌 staff 도 + 버튼 노출.
  // owner 는 항상 true. teacher/assistant 는 default false 이지만 owner 가 명시적으로
  // 토글하면 활성화된다.
  const authUserId = useAuthStore((s) => s.user?.id);
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const myStaffProfile = useMemo(
    () => academyStaffProfiles.find((sp) => sp.user_id === authUserId) || null,
    [academyStaffProfiles, authUserId],
  );
  const canManage = currentUserCan({ role, staffProfile: myStaffProfile }, 'canManageClasses');

  // Phase 44.6 / Phase B — 룰 기반 planned + 기존 classSessions 머지로 nextSession 산출.
  const classScheduleRules = useWorkspaceStore((s) => s.classScheduleRules) ?? [];
  const classSessionExceptions = useWorkspaceStore((s) => s.classSessionExceptions) ?? [];
  const mergedClassSessions = useMemo(() => {
    const from = todayStr;
    const to = (() => {
      const d = new Date(todayStr);
      d.setDate(d.getDate() + 60);
      return d.toISOString().slice(0, 10);
    })();
    const plannedRaw = buildPlannedClassSessions({
      rules: classScheduleRules,
      exceptions: classSessionExceptions,
      fromDate: from,
      toDate: to,
    });
    const plannedShaped = plannedToClassSessionShape(plannedRaw, classGroups);
    return mergePlannedAndActualClassSessions(plannedShaped, classSessions);
  }, [classSessions, classScheduleRules, classSessionExceptions, classGroups, todayStr]);

  const enriched = useMemo(() =>
    classGroups.map((group) => {
      const sessions = mergedClassSessions.filter((s) => s.classGroupId === group.id);
      const nextSession = sessions.filter((s) => s.date >= todayStr && s.status !== 'canceled')
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
      const studentCount = (group.studentIds || []).length;
      const teacherName = (group.teacherId || group.teacherUserId)
        ? getTeacherDisplayName(group.teacherId, academyTeachers, academyProfile, group.teacherUserId)
        : null;
      return { ...group, sessions, nextSession, studentCount, teacherName };
    }).sort((a, b) => {
      const ad = a.nextSession?.date || '9999';
      const bd = b.nextSession?.date || '9999';
      return ad.localeCompare(bd);
    }),
    [classGroups, mergedClassSessions, academyTeachers, academyProfile, todayStr]
  );

  return (
    <div>
      <Header
        title="수업"
        right={
          canManage ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowForm(true)}
              className="h-9 w-9 md:w-auto md:px-4 flex items-center justify-center gap-1.5 rounded-xl bg-[#0064FF] text-white text-sm font-bold shadow-sm active:bg-[#0050CC]"
            >
              <Plus size={14} />
              <span className="hidden md:inline">수업 추가</span>
            </motion.button>
          ) : null
        }
      />

      <div className="pt-14 md:pt-0 pb-6">
        <div className="px-4 pt-4 mb-3">
          <p className="text-sm text-gray-400">반 단위로 수업을 관리해요.</p>
        </div>

        {enriched.length === 0 ? (
          <EmptyState
            icon="📚"
            title="아직 반이 없어요"
            description={canManage ? '반을 만들고 학생과 강사를 배정해요.' : '원장이 반을 생성하면 여기 표시됩니다.'}
            action={
              canManage ? (
                <button
                  onClick={() => setShowForm(true)}
                  className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl"
                >
                  반 만들기
                </button>
              ) : null
            }
          />
        ) : (
          <div className="px-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {enriched.map((group) => {
              const statusInfo = STATUS_MAP[group.status] || STATUS_MAP.active;
              return (
                <motion.div
                  key={group.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigateToClassGroup(group.id)}
                  className="bg-white rounded-2xl p-3.5 md:p-4 shadow-sm cursor-pointer select-none min-h-[190px] flex flex-col"
                >
                  <div className="flex items-center gap-1.5 mb-3 min-w-0">
                    <span className={`text-[10px] md:text-xs px-2 py-1 rounded-full font-semibold whitespace-nowrap ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                    <span className="text-[10px] md:text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-semibold truncate min-w-0">
                      {group.subject || '과목'}
                    </span>
                  </div>

                  <p className="font-extrabold text-gray-900 text-base md:text-lg leading-snug line-clamp-2 min-h-[42px]">
                    {group.name}
                  </p>
                  {group.level && <p className="text-xs text-gray-400 mt-1 truncate">{group.level}</p>}

                  <div className="mt-3 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
                      <span className="flex items-center gap-1 min-w-0">
                        <Users size={12} className="flex-shrink-0" />
                        {group.studentCount}명
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5 text-xs text-gray-500 min-w-0">
                      <Clock size={12} className="flex-shrink-0 mt-0.5" />
                      <span className="leading-relaxed line-clamp-2">
                        {group.weekdays?.join('·') || '요일 미정'}요일{' '}
                        {group.weekdayTimes && Object.keys(group.weekdayTimes).length > 0
                          ? '요일별 시간'
                          : group.startTime || ''}
                      </span>
                    </div>
                    {group.room && <p className="text-xs text-gray-400 truncate">{group.room}</p>}
                    {group.teacherName && (
                      <p className="text-xs text-gray-400 truncate">담당: {group.teacherName}</p>
                    )}
                  </div>

                  {group.nextSession && (
                    <p className="text-xs text-blue-600 font-bold mt-auto pt-3">
                      다음 수업 {formatDateShort(group.nextSession.date)}
                    </p>
                  )}

                  <div className={`${group.nextSession ? 'mt-2.5' : 'mt-auto'} flex items-center justify-between pt-2.5 border-t border-gray-50`}>
                    <span className="text-[11px] text-gray-400">총 {group.sessions.length}회차</span>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <ClassGroupFormModal onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}
