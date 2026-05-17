import { useMemo } from 'react';
import { Plus, ChevronRight, Users, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';
import EmptyState from '../../../components/EmptyState';
import ClassGroupFormModal from './ClassGroupFormModal';
import { today, formatDateShort } from '../../../utils/date';
import { getTeacherDisplayName, OWNER_TEACHER_ID } from '../../../utils/format';
import { useState } from 'react';

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

  const enriched = useMemo(() =>
    classGroups.map((group) => {
      const sessions = classSessions.filter((s) => s.classGroupId === group.id);
      const nextSession = sessions.filter((s) => s.date >= todayStr && s.status !== 'canceled')
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
      const studentCount = (group.studentIds || []).length;
      const teacherName = group.teacherId
        ? getTeacherDisplayName(group.teacherId, academyTeachers, academyProfile)
        : null;
      return { ...group, sessions, nextSession, studentCount, teacherName };
    }).sort((a, b) => {
      const ad = a.nextSession?.date || '9999';
      const bd = b.nextSession?.date || '9999';
      return ad.localeCompare(bd);
    }),
    [classGroups, classSessions, academyTeachers, academyProfile, todayStr]
  );

  return (
    <div>
      <Header
        title="수업 관리"
        right={
          isOwner ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowForm(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white"
            >
              <Plus size={18} />
            </motion.button>
          ) : null
        }
      />

      <div className="pt-14 pb-6">
        <div className="px-4 pt-4 mb-3">
          <p className="text-sm text-gray-400">반 단위로 수업을 관리해요.</p>
        </div>

        {enriched.length === 0 ? (
          <EmptyState
            icon="📚"
            title="아직 반이 없어요"
            description={isOwner ? '반을 만들고 학생과 강사를 배정해요.' : '원장이 반을 생성하면 여기 표시됩니다.'}
            action={
              isOwner ? (
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
          <div className="px-4 flex flex-col gap-3">
            {enriched.map((group) => {
              const statusInfo = STATUS_MAP[group.status] || STATUS_MAP.active;
              return (
                <motion.div
                  key={group.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigateToClassGroup(group.id)}
                  className="bg-white rounded-2xl p-4 shadow-sm cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold">
                      {group.subject}
                    </span>
                  </div>

                  <p className="font-bold text-gray-900 text-base mb-0.5">{group.name}</p>
                  {group.level && <p className="text-xs text-gray-400 mb-2">{group.level}</p>}

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Users size={11} />
                        {group.studentCount}명
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {group.weekdays?.join('·')}요일 {group.startTime}
                      </span>
                      {group.room && <span>{group.room}</span>}
                    </div>
                    {group.teacherName && (
                      <p className="text-xs text-gray-400">담당: {group.teacherName}</p>
                    )}
                  </div>

                  {group.nextSession && (
                    <p className="text-xs text-blue-600 font-semibold mt-2.5">
                      다음 수업 {formatDateShort(group.nextSession.date)}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-50">
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
