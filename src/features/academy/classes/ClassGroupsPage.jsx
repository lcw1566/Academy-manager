import { useState, useMemo } from 'react';
import { Plus, ChevronRight, Users, Clock, MoreHorizontal, Trash2, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { sheetTransition, fadeTransition } from '../../../utils/motion';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';
import EmptyState from '../../../components/EmptyState';
import ClassGroupFormModal from './ClassGroupFormModal';
import { today, formatDateShort } from '../../../utils/date';

const STATUS_MAP = {
  active:   { label: '운영 중', color: 'bg-green-50 text-green-700' },
  inactive: { label: '종료',   color: 'bg-gray-100 text-gray-500' },
  pending:  { label: '대기',   color: 'bg-yellow-50 text-yellow-700' },
};

export default function ClassGroupsPage() {
  const {
    role, classGroups, classSessions, academyStudents, academyTeachers,
    navigateToClassGroup, deleteClassGroup,
  } = useAcademyStore();

  const [showForm, setShowForm] = useState(false);
  const [editGroup, setEditGroup] = useState(null);
  const [menuGroupId, setMenuGroupId] = useState(null);
  const todayStr = today();
  const isOwner = role === 'owner';

  const enriched = useMemo(() =>
    classGroups.map((group) => {
      const sessions = classSessions.filter((s) => s.classGroupId === group.id);
      const nextSession = sessions.filter((s) => s.date >= todayStr && s.status !== 'canceled')
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      const studentCount = (group.studentIds || []).length;
      const teacher = academyTeachers.find((t) => t.id === group.teacherId);
      return { ...group, sessions, nextSession, studentCount, teacher };
    }).sort((a, b) => {
      const ad = a.nextSession?.date || '9999';
      const bd = b.nextSession?.date || '9999';
      return ad.localeCompare(bd);
    }),
    [classGroups, classSessions, academyTeachers, todayStr]
  );

  const handleDelete = (groupId) => {
    if (window.confirm('반과 모든 수업 회차를 삭제할까요?')) {
      deleteClassGroup(groupId);
      setMenuGroupId(null);
    }
  };

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
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold">
                        {group.subject}
                      </span>
                    </div>
                    {isOwner && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuGroupId(group.id); }}
                        className="w-7 h-7 flex items-center justify-center rounded-full active:bg-gray-100"
                      >
                        <MoreHorizontal size={15} className="text-gray-400" />
                      </button>
                    )}
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
                    {group.teacher && (
                      <p className="text-xs text-gray-400">담당: {group.teacher.name}</p>
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

      {/* 메뉴 시트 */}
      <AnimatePresence>
        {menuGroupId && (
          <>
            <motion.div key="dim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={fadeTransition} className="fixed inset-0 bg-black/40 z-40" onClick={() => setMenuGroupId(null)} />
            <motion.div key="sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={sheetTransition}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-4 pt-5 pb-10"
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <div className="flex flex-col gap-2">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setEditGroup(classGroups.find((g) => g.id === menuGroupId)); setMenuGroupId(null); }}
                  className="flex items-center gap-3 px-4 py-4 bg-gray-50 rounded-2xl text-left">
                  <Pencil size={18} className="text-blue-500" />
                  <p className="text-sm font-semibold text-gray-900">반 정보 수정</p>
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleDelete(menuGroupId)}
                  className="flex items-center gap-3 px-4 py-4 bg-red-50 rounded-2xl text-left">
                  <Trash2 size={18} className="text-red-500" />
                  <p className="text-sm font-semibold text-red-600">반 삭제</p>
                </motion.button>
              </div>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setMenuGroupId(null)}
                className="w-full mt-3 py-3 rounded-2xl bg-gray-100 text-sm font-semibold text-gray-600">
                취소
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {(showForm || editGroup) && (
        <ClassGroupFormModal
          editGroup={editGroup}
          onClose={() => { setShowForm(false); setEditGroup(null); }}
        />
      )}
    </div>
  );
}
