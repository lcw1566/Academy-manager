import { useState, useMemo } from 'react';
import {
  Plus, ChevronRight, ChevronDown, MoreHorizontal,
  RefreshCw, CalendarDays, Trash2, Pencil,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { sheetTransition, fadeTransition } from '../../utils/motion';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import ClassFormModal from './ClassFormModal';
import EditGroupModal from './EditGroupModal';
import EditClassModal from './EditClassModal';
import { today, formatDateShort } from '../../utils/date';
import { classTypeColors } from '../../utils/format';
import { DAY_NAMES } from '../../utils/recurringClass';

const formatDaysBullet = (daysOfWeek) =>
  daysOfWeek
    .slice()
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((d) => DAY_NAMES[d])
    .join(' · ');

const VIEW_FILTERS = [
  { id: 'all',     label: '전체' },
  { id: 'regular', label: '정기' },
  { id: 'group',   label: '그룹' },
  { id: 'oneoff',  label: '단발' },
];

const SORT_OPTIONS = [
  { id: 'nextClass',   label: '다음 수업 빠른 순' },
  { id: 'recent',      label: '최근 생성 순' },
  { id: 'studentName', label: '학생 이름순' },
  { id: 'subject',     label: '과목순' },
  { id: 'incomplete',  label: '미작성 알림장 많은 순' },
];

const ADD_ACTIONS = [
  {
    id: 'recurring',
    icon: <RefreshCw size={20} className="text-blue-600" />,
    title: '정기 과외 등록',
    desc: '반복되는 과외 일정을 한 번에 만들어요.',
    mode: 'recurring',
  },
  {
    id: 'oneoff',
    icon: <CalendarDays size={20} className="text-purple-600" />,
    title: '단발 수업 추가',
    desc: '보강, 시험 직전 특강처럼 한 번만 진행하는 수업이에요.',
    mode: 'single',
    type: '단발 수업',
  },
];

export default function ClassesPage() {
  const {
    repeatGroups, classes, students, attendanceRecords, lessonRecords,
    navigateToRepeatGroup, navigateToClass,
    deleteRepeatGroup, deleteClass,
  } = useAcademyStore();

  const [showActionSheet, setShowActionSheet] = useState(false);
  const [formState, setFormState] = useState(null);
  const [viewFilter, setViewFilter] = useState('all');
  const [sortBy, setSortBy] = useState('nextClass');
  const [showSortSheet, setShowSortSheet] = useState(false);

  // 카드 메뉴 상태
  const [menuState, setMenuState] = useState(null); // { kind: 'group'|'single', id }
  const [editGroupId, setEditGroupId] = useState(null);
  const [editClassId, setEditClassId] = useState(null);

  const todayStr = today();

  const openForm = (action) => {
    setShowActionSheet(false);
    setTimeout(() => setFormState({ mode: action.mode, singleType: action.type }), 200);
  };

  const openMenu = (e, kind, id) => {
    e.stopPropagation();
    setMenuState({ kind, id });
  };

  const handleMenuEdit = () => {
    if (menuState.kind === 'group') {
      setEditGroupId(menuState.id);
    } else {
      setEditClassId(menuState.id);
    }
    setMenuState(null);
  };

  const handleMenuDelete = () => {
    if (menuState.kind === 'group') {
      if (window.confirm('수업 그룹과 모든 일정을 삭제할까요?')) {
        deleteRepeatGroup(menuState.id);
      }
    } else {
      if (window.confirm('이 수업을 삭제할까요?')) {
        deleteClass(menuState.id);
      }
    }
    setMenuState(null);
  };

  // ── Build unified items ────────────────────────────────────────────────────
  const groupItems = useMemo(() => repeatGroups.map((group) => {
    const groupClasses = classes.filter((c) => c.repeatGroupId === group.id);
    const groupStudents = students.filter((s) => (group.studentIds || []).includes(s.id));
    const firstStudent = groupStudents[0];
    const studentCount = groupStudents.length;
    const namePrefix =
      studentCount <= 1
        ? firstStudent?.name || ''
        : `${firstStudent?.name || ''} 외 ${studentCount - 1}명`;
    const groupType = studentCount <= 1 ? '정기 과외' : '그룹 과외';

    const nextClass = groupClasses
      .filter((c) => c.date >= todayStr)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];

    const pastClasses = groupClasses.filter((c) => c.date <= todayStr);
    const incompleteAttendance = pastClasses.filter(
      (c) =>
        !(c.studentIds || []).every((sid) =>
          attendanceRecords.some((a) => a.classId === c.id && a.studentId === sid)
        )
    ).length;

    const unwrittenNotes = pastClasses.filter((c) =>
      (c.studentIds || []).some(
        (sid) =>
          !lessonRecords.some(
            (lr) => lr.classId === c.id && lr.studentId === sid && lr.content?.trim()
          )
      )
    ).length;

    return {
      kind: 'group',
      id: group.id,
      group,
      groupType,
      namePrefix,
      studentCount,
      groupStudents,
      groupClasses,
      nextClass,
      incompleteAttendance,
      unwrittenNotes,
      totalCount: groupClasses.length,
      completedCount: groupClasses.filter((c) => c.date < todayStr).length,
      createdId: group.id,
    };
  }), [repeatGroups, classes, students, attendanceRecords, lessonRecords, todayStr]);

  const singleItems = useMemo(() => classes
    .filter((c) => !c.repeatGroupId)
    .map((cls) => {
      const clsStudents = students.filter((s) => (cls.studentIds || []).includes(s.id));
      const unwrittenNotes = clsStudents.filter(
        (s) =>
          !lessonRecords.some(
            (lr) => lr.classId === cls.id && lr.studentId === s.id && lr.content?.trim()
          )
      ).length;
      return {
        kind: 'single',
        id: cls.id,
        cls,
        clsStudents,
        nextClass: cls.date >= todayStr ? cls : null,
        unwrittenNotes,
        createdId: cls.id,
      };
    }), [classes, students, lessonRecords, todayStr]);

  // ── Filter + Sort ──────────────────────────────────────────────────────────
  const sortedItems = useMemo(() => {
    const filteredGroups = groupItems.filter((item) => {
      if (viewFilter === 'all') return true;
      if (viewFilter === 'regular') return item.groupType === '정기 과외';
      if (viewFilter === 'group') return item.groupType === '그룹 과외';
      return false;
    });
    const filteredSingles = singleItems.filter((item) => {
      if (viewFilter === 'all') return true;
      if (viewFilter === 'regular' || viewFilter === 'group') return false;
      if (viewFilter === 'oneoff') return ['단발 수업', '보강'].includes(item.cls.type);
      return true;
    });
    return [...filteredGroups, ...filteredSingles].sort((a, b) => {
      if (sortBy === 'nextClass') {
        const aDate = a.nextClass?.date || '9999-99-99';
        const bDate = b.nextClass?.date || '9999-99-99';
        return aDate.localeCompare(bDate);
      }
      if (sortBy === 'recent') return b.createdId.localeCompare(a.createdId);
      if (sortBy === 'studentName') {
        const aName = a.kind === 'group' ? (a.groupStudents[0]?.name || '') : (a.clsStudents[0]?.name || '');
        const bName = b.kind === 'group' ? (b.groupStudents[0]?.name || '') : (b.clsStudents[0]?.name || '');
        return aName.localeCompare(bName, 'ko');
      }
      if (sortBy === 'subject') {
        const aSubj = a.kind === 'group' ? a.group.subject : a.cls.subject;
        const bSubj = b.kind === 'group' ? b.group.subject : b.cls.subject;
        return (aSubj || '').localeCompare(bSubj || '', 'ko');
      }
      if (sortBy === 'incomplete') return b.unwrittenNotes - a.unwrittenNotes;
      return 0;
    });
  }, [groupItems, singleItems, viewFilter, sortBy]);

  const isEmpty =
    repeatGroups.length === 0 && classes.filter((c) => !c.repeatGroupId).length === 0;
  const currentSortLabel = SORT_OPTIONS.find((o) => o.id === sortBy)?.label || '';

  return (
    <div>
      <Header
        title="수업"
        right={
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowActionSheet(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white"
          >
            <Plus size={18} />
          </motion.button>
        }
      />

      <div className="pt-14 pb-6">
        <div className="px-4 pt-5 mb-3">
          <p className="text-sm text-gray-400">등록한 수업을 종류별로 관리해요.</p>
        </div>

        {/* 보기 필터 */}
        <div className="px-4 mb-3">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {VIEW_FILTERS.map((f) => (
              <motion.button
                key={f.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setViewFilter(f.id)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  viewFilter === f.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-500 border border-gray-200'
                }`}
              >
                {f.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* 정렬 */}
        {sortedItems.length > 0 && (
          <div className="px-4 mb-3 flex justify-end">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSortSheet(true)}
              className="flex items-center gap-1 text-xs text-gray-500 font-medium bg-white border border-gray-200 px-3 py-1.5 rounded-full"
            >
              {currentSortLabel}
              <ChevronDown size={12} />
            </motion.button>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="mx-4 bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-3xl mb-3">📚</p>
            <p className="font-semibold text-gray-700 mb-1">아직 등록된 수업이 없어요.</p>
            <p className="text-xs text-gray-400 mb-5">
              정기 과외를 등록하면 수업별로<br />일정과 기록을 관리할 수 있어요.
            </p>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowActionSheet(true)}
              className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl"
            >
              수업 추가하기
            </motion.button>
          </div>
        )}

        {!isEmpty && sortedItems.length === 0 && (
          <div className="mx-4 bg-white rounded-2xl p-6 shadow-sm text-center">
            <p className="text-sm text-gray-500">해당 조건의 수업이 없어요.</p>
          </div>
        )}

        {/* 카드 목록 */}
        <div className="px-4 flex flex-col gap-3">
          {sortedItems.map((item) =>
            item.kind === 'group' ? (
              <GroupCard
                key={item.id}
                item={item}
                onPress={() => navigateToRepeatGroup(item.id)}
                onMenu={(e) => openMenu(e, 'group', item.id)}
              />
            ) : (
              <SingleCard
                key={item.id}
                item={item}
                onPress={() => navigateToClass(item.id)}
                onMenu={(e) => openMenu(e, 'single', item.id)}
              />
            )
          )}
        </div>
      </div>

      {/* 수업 추가 Action Sheet */}
      <AnimatePresence>
        {showActionSheet && (
          <>
            <motion.div
              key="add-dim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={fadeTransition}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowActionSheet(false)}
            />
            <motion.div
              key="add-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={sheetTransition}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-4 pt-5 pb-10"
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <p className="text-base font-bold text-gray-900 mb-4">수업 추가</p>
              <div className="flex flex-col gap-3">
                {ADD_ACTIONS.map((action) => (
                  <motion.button
                    key={action.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => openForm(action)}
                    className="flex items-center gap-4 bg-gray-50 rounded-2xl px-4 py-3.5 text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                      {action.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{action.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{action.desc}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowActionSheet(false)}
                className="w-full mt-4 py-3 rounded-2xl bg-gray-100 text-sm font-semibold text-gray-600"
              >
                취소
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 카드 "..." 메뉴 Bottom Sheet */}
      <AnimatePresence>
        {menuState && (
          <>
            <motion.div
              key="menu-dim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={fadeTransition}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setMenuState(null)}
            />
            <motion.div
              key="menu-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={sheetTransition}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-4 pt-5 pb-10"
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <div className="flex flex-col gap-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleMenuEdit}
                  className="flex items-center gap-3 px-4 py-4 bg-gray-50 rounded-2xl text-left"
                >
                  <Pencil size={18} className="text-blue-500" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">수정하기</p>
                    <p className="text-xs text-gray-400 mt-0.5">수업 정보를 변경해요</p>
                  </div>
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleMenuDelete}
                  className="flex items-center gap-3 px-4 py-4 bg-red-50 rounded-2xl text-left"
                >
                  <Trash2 size={18} className="text-red-500" />
                  <div>
                    <p className="text-sm font-semibold text-red-600">삭제하기</p>
                    <p className="text-xs text-red-400 mt-0.5">
                      {menuState.kind === 'group' ? '수업 그룹과 모든 일정이 삭제돼요' : '이 수업이 삭제돼요'}
                    </p>
                  </div>
                </motion.button>
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setMenuState(null)}
                className="w-full mt-3 py-3 rounded-2xl bg-gray-100 text-sm font-semibold text-gray-600"
              >
                취소
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 정렬 Bottom Sheet */}
      <AnimatePresence>
        {showSortSheet && (
          <>
            <motion.div
              key="sort-dim"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={fadeTransition}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowSortSheet(false)}
            />
            <motion.div
              key="sort-sheet"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={sheetTransition}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-4 pt-5 pb-10"
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <p className="text-base font-bold text-gray-900 mb-4">정렬 기준</p>
              <div className="flex flex-col gap-2">
                {SORT_OPTIONS.map((opt) => (
                  <motion.button
                    key={opt.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setSortBy(opt.id); setShowSortSheet(false); }}
                    className={`flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-semibold transition-colors ${
                      sortBy === opt.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-50 text-gray-700'
                    }`}
                  >
                    {opt.label}
                    {sortBy === opt.id && <span className="text-xs opacity-70">선택됨</span>}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 수업 등록 폼 */}
      {formState && (
        <ClassFormModal
          onClose={() => setFormState(null)}
          initialMode={formState.mode}
          initialSingleType={formState.singleType}
        />
      )}

      {/* 수업 그룹 수정 */}
      {editGroupId && (
        <EditGroupModal groupId={editGroupId} onClose={() => setEditGroupId(null)} />
      )}

      {/* 단발 수업 수정 */}
      {editClassId && (
        <EditClassModal classId={editClassId} onClose={() => setEditClassId(null)} />
      )}
    </div>
  );
}

// ── Group Card ────────────────────────────────────────────────────────────────

function GroupCard({ item, onPress, onMenu }) {
  const {
    group, groupType, namePrefix, groupStudents, groupClasses, nextClass,
    incompleteAttendance, unwrittenNotes, totalCount, completedCount,
  } = item;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onPress}
      className="bg-white rounded-2xl p-4 shadow-sm cursor-pointer select-none"
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${classTypeColors[groupType] || 'bg-gray-100 text-gray-600'}`}>
          {groupType}
        </span>
        <div className="flex items-center gap-1.5">
          {incompleteAttendance > 0 && (
            <span className="text-[11px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full font-medium">
              출결 {incompleteAttendance}
            </span>
          )}
          {unwrittenNotes > 0 && (
            <span className="text-[11px] bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-medium">
              알림장 {unwrittenNotes}
            </span>
          )}
          <button
            onClick={onMenu}
            className="w-7 h-7 flex items-center justify-center rounded-full active:bg-gray-100 ml-1"
          >
            <MoreHorizontal size={15} className="text-gray-400" />
          </button>
        </div>
      </div>

      <p className="font-bold text-gray-900 text-base mb-0.5">
        {namePrefix} {group.subject}
      </p>
      <p className="text-sm text-gray-500 mb-2">
        {groupStudents.map((s) => s.name).join(', ')}
        {groupStudents.length > 1 && ` (${groupStudents.length}명)`}
      </p>

      <div className="flex flex-col gap-1">
        <p className="text-xs text-gray-400">
          {group.repeatType} {formatDaysBullet(group.daysOfWeek)}요일 · {group.startTime} – {group.endTime}
        </p>
        {group.location && <p className="text-xs text-gray-400">{group.location}</p>}
      </div>

      {nextClass && (
        <p className="text-xs text-blue-600 font-semibold mt-2.5">
          다음 수업 {formatDateShort(nextClass.date)}
        </p>
      )}

      <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-gray-50">
        <span className="text-[11px] text-gray-400">총 {totalCount}회</span>
        <span className="text-[11px] text-gray-300">·</span>
        <span className="text-[11px] text-gray-400">완료 {completedCount}회</span>
        <span className="text-[11px] text-gray-300">·</span>
        <span className="text-[11px] text-gray-400">남은 {Math.max(0, totalCount - completedCount)}회</span>
      </div>
    </motion.div>
  );
}

// ── Single Card ───────────────────────────────────────────────────────────────

function SingleCard({ item, onPress, onMenu }) {
  const { cls, clsStudents } = item;
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={onPress}
      className="bg-white rounded-2xl p-4 shadow-sm cursor-pointer select-none"
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${classTypeColors[cls.type] || 'bg-gray-100 text-gray-600'}`}>
          {cls.type}
        </span>
        <button
          onClick={onMenu}
          className="w-7 h-7 flex items-center justify-center rounded-full active:bg-gray-100"
        >
          <MoreHorizontal size={15} className="text-gray-400" />
        </button>
      </div>
      <p className="font-bold text-gray-900 mb-0.5">{cls.name}</p>
      {clsStudents.length > 0 && (
        <p className="text-sm text-gray-500 mb-1.5">{clsStudents.map((s) => s.name).join(', ')}</p>
      )}
      <p className="text-xs text-gray-400">
        {formatDateShort(cls.date)} · {cls.startTime} – {cls.endTime}
      </p>
      {cls.location && <p className="text-xs text-gray-400 mt-0.5">{cls.location}</p>}
    </motion.div>
  );
}
