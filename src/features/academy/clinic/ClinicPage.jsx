import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';
import EmptyState from '../../../components/EmptyState';
import ClinicRecordFormModal from './ClinicRecordFormModal';
import { today, formatDateShort } from '../../../utils/date';
import { CLINIC_SUBJECT_FILTERS, DATE_FILTER_OPTIONS } from '../../../constants/labels';

function groupByDate(records) {
  const map = {};
  records.forEach((r) => {
    const d = r.date || 'unknown';
    if (!map[d]) map[d] = [];
    map[d].push(r);
  });
  return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
}

function formatGroupDate(dateStr) {
  if (!dateStr || dateStr === 'unknown') return '날짜 없음';
  const [y, m, d] = dateStr.split('-');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = days[new Date(dateStr).getDay()];
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 ${weekday}요일`;
}

function isInDateRange(dateStr, filter) {
  if (filter === 'all') return true;
  const now = new Date();
  const d = new Date(dateStr);
  if (filter === 'today') {
    return dateStr === today();
  }
  if (filter === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return d >= start && d <= end;
  }
  if (filter === 'month') {
    return dateStr.slice(0, 7) === today().slice(0, 7);
  }
  return true;
}

const SUPPORT_TAG_LABELS = {
  homework:       '숙제 미완료',
  wrong_answer:   '오답 풀이 필요',
  vocabulary:     '단어 재시험',
  reading:        '본문 암기',
  grammar:        '문법 보충',
  concept:        '개념 재설명',
  test_retry:     '테스트 재응시',
  absence_makeup: '결석 보강',
  other:          '기타',
};

export default function ClinicPage() {
  const {
    role, clinicRecords = [], academyStudents, classGroups,
    academyLessonRecords = [], classSessions = [],
    deleteClinicRecord,
  } = useAcademyStore();

  const [subjectFilter, setSubjectFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const todayStr = today();

  // 보조강사: 강사가 수업에서 남긴 보완 항목 목록
  const supportItems = useMemo(() => {
    if (role !== 'assistant') return [];
    return academyLessonRecords
      .filter((lr) => lr.studentId !== '_common_' && (lr.supportTags?.length > 0 || lr.supportMemo?.trim()))
      .map((lr) => {
        const session = classSessions.find((s) => s.id === lr.sessionId);
        const group = session ? classGroups.find((g) => g.id === session.classGroupId) : null;
        const student = academyStudents.find((s) => s.id === lr.studentId);
        return { ...lr, session, group, student };
      })
      .sort((a, b) => (b.session?.date || '').localeCompare(a.session?.date || ''));
  }, [role, academyLessonRecords, classSessions, classGroups, academyStudents]);

  const [showClinicFromSupport, setShowClinicFromSupport] = useState(null);

  const filtered = useMemo(() => {
    let list = clinicRecords;
    if (subjectFilter !== 'all') {
      if (subjectFilter === 'other') {
        list = list.filter((r) => !['국어', '수학', '영어'].includes(r.subject));
      } else {
        list = list.filter((r) => r.subject === subjectFilter);
      }
    }
    list = list.filter((r) => isInDateRange(r.date, dateFilter));
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [clinicRecords, subjectFilter, dateFilter]);

  const todayCount = useMemo(() => clinicRecords.filter((r) => r.date === todayStr).length, [clinicRecords, todayStr]);
  const weekCount = useMemo(() => clinicRecords.filter((r) => isInDateRange(r.date, 'week')).length, [clinicRecords]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const handleDelete = (id) => {
    deleteClinicRecord(id);
    setDeleteConfirmId(null);
    setExpandedId(null);
  };

  return (
    <div>
      <Header
        title="클리닉"
        right={
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowForm(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white"
          >
            <Plus size={18} />
          </motion.button>
        }
      />

      <div className="pt-14 pb-6">
        {/* 요약 */}
        <div className="px-4 pt-4 grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">오늘 클리닉 기록</p>
            <p className={`text-2xl font-bold ${todayCount > 0 ? 'text-blue-600' : 'text-gray-900'}`}>{todayCount}건</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">이번 주 클리닉</p>
            <p className="text-2xl font-bold text-gray-900">{weekCount}건</p>
          </div>
        </div>

        {/* 보조강사: 수업에서 남긴 보완 항목 */}
        {role === 'assistant' && supportItems.length > 0 && (
          <div className="px-4 mb-5">
            <p className="text-sm font-bold text-gray-700 mb-2">수업에서 남긴 보완 항목</p>
            <div className="flex flex-col gap-2">
              {supportItems.map((item) => (
                <div key={item.id} className="bg-orange-50 rounded-2xl px-4 py-3.5 border border-orange-100">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold text-gray-900">{item.student?.name || '학생'}</span>
                        {item.group && (
                          <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full font-medium">
                            {item.group.name}
                          </span>
                        )}
                      </div>
                      {item.session && (
                        <p className="text-[10px] text-gray-400">{formatDateShort(item.session.date)}</p>
                      )}
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setShowClinicFromSupport(item)}
                      className="flex-shrink-0 text-xs font-semibold text-white bg-orange-500 px-3 py-1.5 rounded-xl"
                    >
                      클리닉 기록
                    </motion.button>
                  </div>
                  {item.supportTags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {item.supportTags.map((tag) => (
                        <span key={tag} className="text-xs bg-white text-orange-600 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                          {SUPPORT_TAG_LABELS[tag] || tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.supportMemo?.trim() && (
                    <p className="text-xs text-gray-600 bg-white rounded-xl px-2.5 py-1.5">{item.supportMemo}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 날짜 필터 */}
        <div className="px-4 mb-2">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {DATE_FILTER_OPTIONS.map(({ id, label }) => (
              <motion.button
                key={id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setDateFilter(id)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  dateFilter === id ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border border-gray-200'
                }`}
              >
                {label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* 과목 필터 */}
        <div className="px-4 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {CLINIC_SUBJECT_FILTERS.map(({ id, label }) => (
              <motion.button
                key={id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSubjectFilter(id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  subjectFilter === id ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 border border-gray-200'
                }`}
              >
                {label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* 클리닉 목록 */}
        {grouped.length === 0 ? (
          <EmptyState
            icon="📋"
            title="클리닉 기록이 없어요"
            description="+ 버튼을 눌러 학생별 클리닉 기록을 추가해보세요."
          />
        ) : (
          <div className="px-4 flex flex-col gap-5">
            {grouped.map(([dateStr, records]) => (
              <div key={dateStr}>
                <p className="text-xs font-bold text-gray-400 mb-2">{formatGroupDate(dateStr)}</p>
                <div className="flex flex-col gap-2">
                  {records.map((record) => (
                    <ClinicRecordCard
                      key={record.id}
                      record={record}
                      academyStudents={academyStudents}
                      classGroups={classGroups}
                      expanded={expandedId === record.id}
                      onToggle={() => setExpandedId(expandedId === record.id ? null : record.id)}
                      onEdit={() => { setEditRecord(record); setExpandedId(null); }}
                      onDeleteRequest={() => setDeleteConfirmId(record.id)}
                      role={role}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 클리닉 추가/수정 폼 */}
      {(showForm || editRecord) && (
        <ClinicRecordFormModal
          editRecord={editRecord}
          onClose={() => { setShowForm(false); setEditRecord(null); }}
        />
      )}

      {/* 보완 항목에서 클리닉 기록 작성 */}
      {showClinicFromSupport && (
        <ClinicRecordFormModal
          presetClassGroupId={showClinicFromSupport.group?.id}
          presetClassSessionId={showClinicFromSupport.sessionId}
          presetStudentId={showClinicFromSupport.studentId}
          presetDate={showClinicFromSupport.session?.date}
          presetSubject={showClinicFromSupport.group?.subject || ''}
          onClose={() => setShowClinicFromSupport(null)}
        />
      )}

      {/* 삭제 확인 — createPortal로 transform 조상 탈출 */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
        {deleteConfirmId && (
          <>
            <motion.div
              key="dim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setDeleteConfirmId(null)}
            />
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-4 pt-5 pb-10"
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <p className="text-base font-bold text-gray-900 mb-1">클리닉 기록을 삭제할까요?</p>
              <p className="text-sm text-gray-500 mb-6">삭제한 기록은 되돌릴 수 없어요.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm"
                >
                  취소
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="flex-1 py-3.5 rounded-xl bg-red-500 text-white font-bold text-sm"
                >
                  삭제
                </button>
              </div>
            </motion.div>
          </>
        )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

function ClinicRecordCard({ record, academyStudents, classGroups, expanded, onToggle, onEdit, onDeleteRequest, role }) {
  const student = academyStudents.find((s) => s.id === record.studentId);
  const group = classGroups.find((g) => g.id === record.classGroupId);
  const itemCount = record.items?.length || 0;
  const firstItem = record.items?.[0];
  const extraCount = itemCount - 1;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button className="w-full px-4 py-3.5 text-left" onClick={onToggle}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-bold text-gray-900">{student?.name || '학생'}</span>
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{record.subject || '기타'}</span>
            </div>
            {firstItem && (
              <p className="text-xs text-gray-500">
                {firstItem.title}
                {extraCount > 0 && <span className="text-gray-400"> 외 {extraCount}개</span>}
              </p>
            )}
            {group && <p className="text-[10px] text-gray-400 mt-0.5">{group.name}</p>}
          </div>
          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </div>
        </div>
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div style={{ overflow: 'hidden', opacity: expanded ? 1 : 0, transition: 'opacity 0.18s ease' }}>
            <div className="px-4 pb-4 border-t border-gray-50">
              {/* 항목별 기록 */}
              {record.items?.map((item, idx) => (
                <div key={item.id || idx} className="mt-3 bg-gray-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-bold text-gray-700 mb-1">{item.title}</p>
                  {item.description && <p className="text-xs text-gray-600 mb-1">{item.description}</p>}
                  {item.result && (
                    <p className="text-xs text-blue-600 font-medium">결과: {item.result}</p>
                  )}
                  {item.memo && (
                    <p className="text-xs text-gray-400 mt-0.5">메모: {item.memo}</p>
                  )}
                </div>
              ))}

              {/* 전체 메모 */}
              {record.overallMemo && (
                <div className="mt-3 bg-blue-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs font-semibold text-blue-700 mb-1">전체 메모</p>
                  <p className="text-xs text-blue-600">{record.overallMemo}</p>
                </div>
              )}

              {/* 수정/삭제 버튼 */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={onEdit}
                  className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl"
                >
                  <Pencil size={12} />
                  수정
                </button>
                <button
                  onClick={onDeleteRequest}
                  className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-500 text-xs font-bold rounded-xl"
                >
                  <Trash2 size={12} />
                  삭제
                </button>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}
