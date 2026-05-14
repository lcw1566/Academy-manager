import { useState } from 'react';
import { Plus, ChevronRight, ChevronDown, X, CalendarDays, RefreshCw, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import ClassFormModal from './ClassFormModal';
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
  { id: 'all',       label: '전체' },
  { id: 'regular',   label: '정기' },
  { id: 'group',     label: '그룹' },
  { id: 'oneoff',    label: '단발' },
  { id: 'consult',   label: '상담' },
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
  {
    id: 'consult',
    icon: <MessageCircle size={20} className="text-green-600" />,
    title: '상담 일정 추가',
    desc: '학생 또는 학부모 상담 일정을 등록해요.',
    mode: 'single',
    type: '상담',
  },
];

export default function ClassesPage() {
  const {
    repeatGroups, classes, students, attendanceRecords, lessonRecords,
    navigateToRepeatGroup, navigateToClass,
  } = useAcademyStore();

  const [showActionSheet, setShowActionSheet] = useState(false);
  const [formState, setFormState] = useState(null); // { mode, singleType }
  const [viewFilter, setViewFilter] = useState('all');
  const [sortBy, setSortBy] = useState('nextClass');
  const [showSortSheet, setShowSortSheet] = useState(false);

  const todayStr = today();

  const openForm = (action) => {
    setShowActionSheet(false);
    setTimeout(() => setFormState({ mode: action.mode, singleType: action.type }), 200);
  };

  // ── Build unified group items ────────────────────────────────────────────
  const groupItems = repeatGroups.map((group) => {
    const groupClasses = classes.filter((c) => c.repeatGroupId === group.id);
    const groupStudents = students.filter((s) => group.studentIds.includes(s.id));
    const firstStudent = groupStudents[0];
    const studentCount = groupStudents.length;
    const namePrefix =
      studentCount <= 1
        ? firstStudent?.name || ''
        : `${firstStudent?.name || ''} 외 ${studentCount - 1}명`;
    const groupType = studentCount <= 1 ? '정기 과외' : '그룹 과외';

    const nextClass = groupClasses
      .filter((c) => c.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    const pastClasses = groupClasses.filter((c) => c.date <= todayStr);
    const incompleteAttendance = pastClasses.filter(
      (c) =>
        !c.studentIds.every((sid) =>
          attendanceRecords.some((a) => a.classId === c.id && a.studentId === sid)
        )
    ).length;

    const unwrittenNotes = pastClasses.filter((c) => {
      return c.studentIds.some(
        (sid) =>
          !lessonRecords.some(
            (lr) => lr.classId === c.id && lr.studentId === sid && lr.content?.trim()
          )
      );
    }).length;

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
  });

  const singleItems = classes
    .filter((c) => !c.repeatGroupId)
    .map((cls) => {
      const clsStudents = students.filter((s) => cls.studentIds.includes(s.id));
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
    });

  // ── Filter ───────────────────────────────────────────────────────────────
  const filteredGroups = groupItems.filter((item) => {
    if (viewFilter === 'all') return true;
    if (viewFilter === 'regular') return item.groupType === '정기 과외';
    if (viewFilter === 'group') return item.groupType === '그룹 과외';
    return false;
  });

  const filteredSingles = singleItems.filter((item) => {
    if (viewFilter === 'all') return true;
    if (viewFilter === 'regular') return false;
    if (viewFilter === 'group') return false;
    if (viewFilter === 'oneoff') return ['단발 수업', '보강'].includes(item.cls.type);
    if (viewFilter === 'consult') return item.cls.type === '상담';
    return true;
  });

  const allItems = [...filteredGroups, ...filteredSingles];

  // ── Sort ─────────────────────────────────────────────────────────────────
  const sortedItems = [...allItems].sort((a, b) => {
    if (sortBy === 'nextClass') {
      const aDate = (a.nextClass?.date) || '9999-99-99';
      const bDate = (b.nextClass?.date) || '9999-99-99';
      return aDate.localeCompare(bDate);
    }
    if (sortBy === 'recent') {
      return b.createdId.localeCompare(a.createdId);
    }
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
    if (sortBy === 'incomplete') {
      return b.unwrittenNotes - a.unwrittenNotes;
    }
    return 0;
  });

  const isEmpty = sortedItems.length === 0 && repeatGroups.length === 0 && classes.filter(c => !c.repeatGroupId).length === 0;
  const currentSortLabel = SORT_OPTIONS.find((o) => o.id === sortBy)?.label || '';

  return (
    <div>
      <Header
        title="수업"
        right={
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => setShowActionSheet(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white"
          >
            <Plus size={18} />
          </motion.button>
        }
      />

      <div className="pt-14 pb-6">
        {/* 설명 */}
        <div className="px-4 pt-5 mb-3">
          <p className="text-sm text-gray-400">등록한 수업을 종류별로 관리해요.</p>
        </div>

        {/* 보기 필터 pills */}
        <div className="px-4 mb-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {VIEW_FILTERS.map((f) => (
              <motion.button
                key={f.id}
                whileTap={{ scale: 0.93 }}
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

        {/* 정렬 버튼 */}
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

        {/* 필터 결과 없음 */}
        {!isEmpty && sortedItems.length === 0 && (
          <div className="mx-4 bg-white rounded-2xl p-6 shadow-sm text-center">
            <p className="text-sm text-gray-500">해당 조건의 수업이 없어요.</p>
          </div>
        )}

        {/* 수업 카드 목록 */}
        <div className="px-4 flex flex-col gap-3">
          {sortedItems.map((item) =>
            item.kind === 'group' ? (
              <GroupCard
                key={item.id}
                item={item}
                todayStr={todayStr}
                onPress={() => navigateToRepeatGroup(item.id)}
              />
            ) : (
              <SingleCard
                key={item.id}
                item={item}
                onPress={() => navigateToClass(item.id)}
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
              key="dim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowActionSheet(false)}
            />
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-4 pt-5 pb-10 safe-bottom"
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

      {/* 정렬 Bottom Sheet */}
      <AnimatePresence>
        {showSortSheet && (
          <>
            <motion.div
              key="sort-dim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowSortSheet(false)}
            />
            <motion.div
              key="sort-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-4 pt-5 pb-10 safe-bottom"
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

      {/* 수업 등록 폼 모달 */}
      {formState && (
        <ClassFormModal
          onClose={() => setFormState(null)}
          initialMode={formState.mode}
          initialSingleType={formState.singleType}
        />
      )}
    </div>
  );
}

// ── Group Card ────────────────────────────────────────────────────────────────

function GroupCard({ item, todayStr, onPress }) {
  const { group, groupType, namePrefix, groupStudents, groupClasses, nextClass,
    incompleteAttendance, unwrittenNotes, totalCount, completedCount } = item;

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onPress}
      className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
    >
      {/* 상단: 타입 라벨 + 뱃지 */}
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
          <ChevronRight size={15} className="text-gray-300" />
        </div>
      </div>

      {/* 수업명 */}
      <p className="font-bold text-gray-900 text-base mb-0.5">
        {namePrefix} {group.subject}
      </p>

      {/* 학생 이름 */}
      <p className="text-sm text-gray-500 mb-2">
        {groupStudents.map((s) => s.name).join(', ')}
        {groupStudents.length > 1 && ` (${groupStudents.length}명)`}
      </p>

      {/* 일정 정보 */}
      <div className="flex flex-col gap-1">
        <p className="text-xs text-gray-400">
          {group.repeatType} {formatDaysBullet(group.daysOfWeek)}요일 · {group.startTime} – {group.endTime}
        </p>
        {group.location && (
          <p className="text-xs text-gray-400">{group.location}</p>
        )}
      </div>

      {/* 다음 수업 */}
      {nextClass && (
        <p className="text-xs text-blue-600 font-semibold mt-2.5">
          다음 수업 {formatDateShort(nextClass.date)}
        </p>
      )}

      {/* 진행 현황 */}
      <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-gray-50">
        <span className="text-[11px] text-gray-400">총 {totalCount}회</span>
        <span className="text-[11px] text-gray-300">·</span>
        <span className="text-[11px] text-gray-400">완료 {completedCount}회</span>
        <span className="text-[11px] text-gray-300">·</span>
        <span className="text-[11px] text-gray-400">남은 {Math.max(0, totalCount - completedCount)}회</span>
      </div>
    </motion.button>
  );
}

// ── Single Card ───────────────────────────────────────────────────────────────

function SingleCard({ item, onPress }) {
  const { cls, clsStudents } = item;
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onPress}
      className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${classTypeColors[cls.type] || 'bg-gray-100 text-gray-600'}`}>
          {cls.type}
        </span>
        <ChevronRight size={15} className="text-gray-300" />
      </div>
      <p className="font-bold text-gray-900 mb-0.5">{cls.name}</p>
      {clsStudents.length > 0 && (
        <p className="text-sm text-gray-500 mb-1.5">{clsStudents.map((s) => s.name).join(', ')}</p>
      )}
      <p className="text-xs text-gray-400">
        {formatDateShort(cls.date)} · {cls.startTime} – {cls.endTime}
      </p>
      {cls.location && <p className="text-xs text-gray-400 mt-0.5">{cls.location}</p>}
    </motion.button>
  );
}
