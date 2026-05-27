import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit2, Phone, Trash2, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { sheetTransition, fadeTransition, collapseMotion } from '../../utils/motion';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import EmptyState from '../../components/EmptyState';
import StudentFormModal from './StudentFormModal';
import ClassFormModal from '../classes/ClassFormModal';
import StudentEventModal from './StudentEventModal';
import ExamResultModal from './ExamResultModal';
import StudentLessonsTab from './StudentLessonsTab';
import { formatCurrency, paymentStatusMap } from '../../utils/format';
import { formatDateShort, getCurrentMonth, today, getDDayLabel, getDDay, isPastDate } from '../../utils/date';
import { STUDENT_EVENT_TYPES, IMPORTANCE_LABELS, EXAM_TYPES, GRADE_LABELS } from '../../constants/studentSchedule';

const TABS = [
  { id: 'info',     label: '요약' },
  { id: 'lessons',  label: '수업' },
  { id: 'exams',    label: '시험/성적' },
  { id: 'payments', label: '수납' },
];

// Exclude legacy types from exam tab display
const EXAM_TAB_TYPES = ['midterm', 'final', 'mock', 'csat', 'performance', 'unit', 'school', 'other'];

function getScoreChange(result, allResults) {
  if (result.score === null || result.score === undefined) return null;
  const prev = allResults
    .filter((r) => r.id !== result.id && r.subject === result.subject && r.examType === result.examType && r.date < result.date && r.score !== null && r.score !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!prev) return null;
  const currPct = (result.score / (result.maxScore || 100)) * 100;
  const prevPct = (prev.score / (prev.maxScore || 100)) * 100;
  return Math.round((currPct - prevPct) * 10) / 10;
}

export default function StudentDetailPage() {
  const {
    selectedStudentId, students, classes,
    lessonRecords, attendanceRecords, payments, repeatGroups,
    studentEvents, examResults,
    deleteRepeatGroupFuture,
    deleteStudentEvent, deleteExamResult,
    goBackFromStudent, navigateToClass, deleteStudent,
  } = useAcademyStore();

  const student = students.find((s) => s.id === selectedStudentId);
  const [tab, setTab] = useState('info');
  const [showEdit, setShowEdit] = useState(false);
  const [showClassForm, setShowClassForm] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [showExamModal, setShowExamModal] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showAllTimeline, setShowAllTimeline] = useState(false);

  if (!student) return null;

  const handleDelete = () => {
    if (window.confirm(`${student.name} 학생을 삭제할까요?\n수업 기록, 출결, 수납 데이터는 유지됩니다.`)) {
      goBackFromStudent();
      deleteStudent(student.id);
    }
  };

  const openAddEvent = () => { setEditingEvent(null); setShowAddSheet(false); setShowEventModal(true); };
  const openAddExam  = () => { setEditingExam(null);  setShowAddSheet(false); setShowExamModal(true); };

  const currentMonth = getCurrentMonth();

  const studentPayments = payments
    .filter((p) => p.studentId === student.id)
    .sort((a, b) => b.month.localeCompare(a.month));
  const thisMonthPayment = studentPayments.find((p) => p.month === currentMonth);

  // Only show exam-type events in the exams tab (exclude consultation/makeup)
  const studentEventsFiltered = (studentEvents || [])
    .filter((e) => e.studentId === student.id && EXAM_TAB_TYPES.includes(e.eventType))
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcomingEvents = studentEventsFiltered.filter((e) => !isPastDate(e.date));
  const pastEvents    = studentEventsFiltered.filter((e) => isPastDate(e.date));

  const studentExamResults = (examResults || [])
    .filter((r) => r.studentId === student.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const schoolLabel = [student.schoolName || student.school, student.grade].filter(Boolean).join(' ');

  const nearestEvent = upcomingEvents[0] || null;
  const latestResult = studentExamResults[0] || null;
  const latestScoreChange = latestResult ? getScoreChange(latestResult, studentExamResults) : null;
  const hasExamData = studentEventsFiltered.length > 0 || studentExamResults.length > 0;

  const timeline = [
    ...studentEventsFiltered.map((e) => ({ ...e, _kind: 'event' })),
    ...studentExamResults.map((r) => ({ ...r, _kind: 'result' })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  // School type color
  const schoolTypeColor = {
    elementary: 'bg-green-50 text-green-700',
    middle:     'bg-blue-50 text-blue-700',
    high:       'bg-purple-50 text-purple-700',
  }[student.schoolType] || 'bg-gray-100 text-gray-600';

  return (
    <div>
      <Header
        title={student.name}
        onBack={goBackFromStudent}
        right={
          tab === 'exams' ? (
            <button
              onClick={() => setShowAddSheet(true)}
              className="flex items-center gap-1 text-blue-600 font-semibold text-sm"
            >
              <Plus size={18} />
            </button>
          ) : (
            <button onClick={() => setShowEdit(true)}>
              <Edit2 size={18} className="text-gray-500" />
            </button>
          )
        }
      />

      <div className="pt-14 md:pt-0">
        {/* 프로필 카드 */}
        <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600">
              {student.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">{student.name}</h2>
                {thisMonthPayment && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${paymentStatusMap[thisMonthPayment.status]?.bg} ${paymentStatusMap[thisMonthPayment.status]?.color}`}>
                    {paymentStatusMap[thisMonthPayment.status]?.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {(student.schoolName || student.school) && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${schoolTypeColor}`}>
                    {student.schoolName || student.school}
                  </span>
                )}
                {student.grade && (
                  <span className="text-xs text-gray-500">{student.grade}</span>
                )}
              </div>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {student.subjects?.map((sub) => (
                  <span key={sub} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                    {sub}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 탭 */}
        <div className="mx-4 mt-4 flex bg-gray-100 rounded-xl p-1 gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap px-1 ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mx-4 mt-4 pb-24">

          {/* ── 요약 탭 ── */}
          {tab === 'info' && (
            <div className="flex flex-col gap-3">
              <InfoCard label="연락처">
                <InfoRow label="학생" value={student.phone} icon={<Phone size={13} className="text-gray-400" />} />
                <InfoRow label="학부모" value={student.parentPhone} icon={<Phone size={13} className="text-gray-400" />} />
              </InfoCard>
              {student.depositorName && (
                <InfoCard label="수납 정보">
                  <InfoRow label="입금자명" value={student.depositorName} />
                </InfoCard>
              )}
              {student.memo && (
                <InfoCard label="메모">
                  <p className="text-sm text-gray-700">{student.memo}</p>
                </InfoCard>
              )}
              {student.tags?.length > 0 && (
                <InfoCard label="태그">
                  <div className="flex gap-2 flex-wrap">
                    {student.tags.map((tag) => (
                      <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </InfoCard>
              )}

              {/* 시험/성적 요약 카드 */}
              <button
                onClick={() => setTab('exams')}
                className="bg-white rounded-2xl p-4 shadow-sm text-left w-full"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">시험/성적</p>
                  <span className="text-xs text-blue-500 font-medium">자세히 보기 →</span>
                </div>
                {!hasExamData ? (
                  <p className="text-sm text-gray-400">아직 시험이나 성적 기록이 없어요</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {nearestEvent && (
                      <div className="flex items-center gap-2">
                        <span className="text-base">{STUDENT_EVENT_TYPES[nearestEvent.eventType]?.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {nearestEvent.title || STUDENT_EVENT_TYPES[nearestEvent.eventType]?.label}
                            {nearestEvent.subject ? ` · ${nearestEvent.subject}` : ''}
                          </p>
                        </div>
                        <DDayBadge date={nearestEvent.date} />
                      </div>
                    )}
                    {latestResult && (
                      <div className="flex items-center gap-2">
                        <span className="text-base">🏆</span>
                        <p className="text-sm text-gray-700 flex-1 truncate">
                          {latestResult.subject} {latestResult.score !== null && latestResult.score !== undefined ? `${latestResult.score}점` : ''}
                        </p>
                        {latestScoreChange !== null && (
                          <span className={`text-xs font-bold ${latestScoreChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {latestScoreChange >= 0 ? `+${latestScoreChange}` : latestScoreChange}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </button>

              <button
                onClick={handleDelete}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-50 text-red-500 text-sm font-semibold mt-2"
              >
                <Trash2 size={15} />
                학생 삭제
              </button>
            </div>
          )}

          {/* ── 수업 탭 ── */}
          {tab === 'lessons' && (
            <StudentLessonsTab
              student={student}
              onAddClass={() => setShowClassForm(true)}
            />
          )}

          {/* ── 수납 탭 ── */}
          {tab === 'payments' && (
            <div className="flex flex-col gap-2">
              {studentPayments.length === 0 ? (
                <EmptyState icon="💳" title="수납 기록이 없어요" />
              ) : (
                studentPayments.map((p) => {
                  const meta = paymentStatusMap[p.status];
                  return (
                    <div key={p.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.month.replace('-', '년 ')}월</p>
                        <p className="text-xs text-gray-400">결제 예정일 {p.dueDate}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{formatCurrency(p.amount)}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta?.bg} ${meta?.color}`}>
                          {meta?.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── 시험/성적 탭 ── */}
          {tab === 'exams' && (
            <div className="flex flex-col gap-5">
              {!hasExamData ? (
                <EmptyState
                  icon="📊"
                  title="아직 시험이나 성적 기록이 없어요"
                  description={`시험 일정과 성적을 기록하면\n${student.name} 학생의 변화가 한눈에 보여요`}
                  action={
                    <button
                      onClick={() => setShowAddSheet(true)}
                      className="bg-blue-600 text-white text-sm font-semibold px-6 py-3 rounded-2xl"
                    >
                      기록 추가하기
                    </button>
                  }
                />
              ) : (
                <>
                  {/* 요약 카드 */}
                  <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl p-4 text-white">
                    <p className="text-xs font-semibold text-blue-100 mb-3">시험/성적 요약</p>
                    <div className="flex flex-col gap-2.5">
                      {upcomingEvents.length > 0 ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{STUDENT_EVENT_TYPES[nearestEvent.eventType]?.icon}</span>
                            <div>
                              <p className="text-sm font-bold leading-tight">
                                {nearestEvent.title || STUDENT_EVENT_TYPES[nearestEvent.eventType]?.label}
                                {nearestEvent.subject ? ` · ${nearestEvent.subject}` : ''}
                              </p>
                              <p className="text-xs text-blue-200">{nearestEvent.date}</p>
                            </div>
                          </div>
                          <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                            {getDDayLabel(nearestEvent.date)}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-blue-200">다가오는 시험 일정이 없어요</p>
                      )}
                      {latestResult && (
                        <div className="flex items-center justify-between pt-2.5 border-t border-white/20">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🏆</span>
                            <div>
                              <p className="text-sm font-bold leading-tight">
                                {latestResult.subject} {EXAM_TYPES[latestResult.examType] || ''}
                              </p>
                              <p className="text-xs text-blue-200">{latestResult.date}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            {latestResult.score !== null && latestResult.score !== undefined && (
                              <p className="text-base font-black">{latestResult.score}점</p>
                            )}
                            {latestScoreChange !== null && (
                              <p className={`text-xs font-bold ${latestScoreChange >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                                {latestScoreChange >= 0 ? `▲ +${latestScoreChange}%` : `▼ ${latestScoreChange}%`}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 다가오는 시험 */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-bold text-gray-800">다가오는 시험 일정</p>
                      <button onClick={openAddEvent} className="text-xs text-blue-500 font-semibold flex items-center gap-0.5">
                        <Plus size={13} />일정 추가
                      </button>
                    </div>
                    {upcomingEvents.length === 0 ? (
                      <div className="bg-white rounded-2xl p-5 text-center shadow-sm">
                        <p className="text-sm text-gray-400">다가오는 시험 일정이 없어요</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {upcomingEvents.map((ev) => (
                          <EventCard
                            key={ev.id}
                            event={ev}
                            onEdit={() => { setEditingEvent(ev); setShowEventModal(true); }}
                            onDelete={() => { if (window.confirm('일정을 삭제할까요?')) deleteStudentEvent(ev.id); }}
                          />
                        ))}
                      </div>
                    )}
                    {pastEvents.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold text-gray-400 mb-2">지난 일정 ({pastEvents.length}개)</p>
                        <div className="flex flex-col gap-2">
                          {pastEvents.slice().reverse().map((ev) => (
                            <EventCard
                              key={ev.id}
                              event={ev}
                              past
                              onEdit={() => { setEditingEvent(ev); setShowEventModal(true); }}
                              onDelete={() => { if (window.confirm('일정을 삭제할까요?')) deleteStudentEvent(ev.id); }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 최근 성적 */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-bold text-gray-800">최근 성적</p>
                      <button onClick={openAddExam} className="text-xs text-blue-500 font-semibold flex items-center gap-0.5">
                        <Plus size={13} />성적 기록
                      </button>
                    </div>
                    {studentExamResults.length === 0 ? (
                      <div className="bg-white rounded-2xl p-5 text-center shadow-sm">
                        <p className="text-sm text-gray-400">기록된 성적이 없어요</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {studentExamResults.slice(0, 3).map((result) => {
                          const change = getScoreChange(result, studentExamResults);
                          return (
                            <ResultCard
                              key={result.id}
                              result={result}
                              scoreChange={change}
                              onEdit={() => { setEditingExam(result); setShowExamModal(true); }}
                              onDelete={() => { if (window.confirm('성적을 삭제할까요?')) deleteExamResult(result.id); }}
                            />
                          );
                        })}
                        {studentExamResults.length > 3 && (
                          <button
                            onClick={() => setShowAllTimeline(true)}
                            className="text-center text-sm text-blue-500 font-medium py-2"
                          >
                            전체 {studentExamResults.length}개 보기
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 전체 타임라인 */}
                  {timeline.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowAllTimeline((v) => !v)}
                        className="flex items-center justify-between w-full mb-3"
                      >
                        <p className="text-sm font-bold text-gray-800">전체 기록</p>
                        <span className="text-xs text-gray-400 font-medium">
                          {showAllTimeline ? '접기' : `${timeline.length}개 펼치기`}
                        </span>
                      </button>
                      <AnimatePresence>
                        {showAllTimeline && (
                          <motion.div
                            {...collapseMotion}
                          >
                            <div className="flex flex-col gap-0">
                              {timeline.map((item, i) => (
                                <TimelineItem key={item.id} item={item} isLast={i === timeline.length - 1} />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 모달들 */}
      {showEdit && <StudentFormModal initial={student} onClose={() => setShowEdit(false)} />}
      {showClassForm && (
        <ClassFormModal
          onClose={() => setShowClassForm(false)}
          preselectedStudentIds={[student.id]}
        />
      )}
      {showEventModal && (
        <StudentEventModal
          studentId={student.id}
          event={editingEvent}
          onClose={() => { setShowEventModal(false); setEditingEvent(null); }}
        />
      )}
      {showExamModal && (
        <ExamResultModal
          studentId={student.id}
          result={editingExam}
          events={studentEventsFiltered}
          onClose={() => { setShowExamModal(false); setEditingExam(null); }}
        />
      )}

      {/* 시험/성적 추가 bottom sheet — createPortal로 transform 조상 탈출 */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
        {showAddSheet && (
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fadeTransition}
          >
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddSheet(false)} style={{ touchAction: 'none' }} />
            <motion.div
              className="absolute bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-3xl px-5 pt-5 pb-10"
              style={{ maxHeight: 'calc(100vh - env(safe-area-inset-top, 44px) - 16px)' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={sheetTransition}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold text-gray-900">시험/성적 추가</h2>
                <button onClick={() => setShowAddSheet(false)} className="p-1 rounded-full hover:bg-gray-100">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={openAddEvent}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-gray-200 bg-gray-50 text-left active:bg-gray-100"
                >
                  <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center text-xl flex-shrink-0">
                    📅
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">시험 일정 추가</p>
                    <p className="text-xs text-gray-400 mt-0.5">중간고사, 기말고사, 모의고사, 수행평가 일정을 등록해요</p>
                  </div>
                </button>
                <button
                  onClick={openAddExam}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-gray-200 bg-gray-50 text-left active:bg-gray-100"
                >
                  <div className="w-11 h-11 rounded-2xl bg-green-100 flex items-center justify-center text-xl flex-shrink-0">
                    🏆
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">성적 기록 추가</p>
                    <p className="text-xs text-gray-400 mt-0.5">시험 점수, 등급, 취약 단원을 기록해요</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

// ── 서브 컴포넌트들 ──────────────────────────────────────

function DDayBadge({ date }) {
  const dday = getDDay(date);
  if (dday === null) return null;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
      dday === 0 ? 'bg-red-100 text-red-600' :
      dday <= 7  ? 'bg-orange-100 text-orange-600' :
      'bg-blue-50 text-blue-600'
    }`}>
      {getDDayLabel(date)}
    </span>
  );
}

function EventCard({ event, past = false, onEdit, onDelete }) {
  const typeInfo   = STUDENT_EVENT_TYPES[event.eventType] || { icon: '📌', label: event.eventType };
  const importInfo = IMPORTANCE_LABELS[event.importance] || IMPORTANCE_LABELS.medium;

  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm ${past ? 'opacity-55' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl mt-0.5 flex-shrink-0">{typeInfo?.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 truncate">
                {event.title || typeInfo?.label}
                {event.subject ? ` · ${event.subject}` : ''}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {event.date}{event.endDate && event.endDate !== event.date ? ` ~ ${event.endDate}` : ''}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              {!past && <DDayBadge date={event.date} />}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${importInfo.bg} ${importInfo.color}`}>
                {importInfo.label}
              </span>
            </div>
          </div>
          {event.memo && <p className="text-xs text-gray-500 mt-1.5">{event.memo}</p>}
          <div className="flex gap-3 mt-2.5">
            <button onClick={onEdit} className="text-xs text-blue-500 font-medium">수정</button>
            <button onClick={onDelete} className="text-xs text-red-400 font-medium">삭제</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, scoreChange, onEdit, onDelete }) {
  const examLabel = EXAM_TYPES[result.examType] || result.examType;
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{examLabel}</span>
            {result.grade && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                {GRADE_LABELS[result.grade] || `${result.grade}등급`}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-gray-900">
            {result.title ? `${result.title} · ` : ''}{result.subject}
          </p>
          <p className="text-xs text-gray-400">{result.date}</p>
        </div>
        <div className="text-right">
          {result.score !== null && result.score !== undefined && (
            <p className="text-xl font-black text-gray-900 leading-tight">
              {result.score}<span className="text-sm font-normal text-gray-400">/{result.maxScore}</span>
            </p>
          )}
          {scoreChange !== null && scoreChange !== undefined && (
            <p className={`text-xs font-bold ${scoreChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {scoreChange >= 0 ? `▲ +${scoreChange}%` : `▼ ${scoreChange}%`}
            </p>
          )}
        </div>
      </div>
      {result.weakUnits?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {result.weakUnits.map((unit) => (
            <span key={unit} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
              취약: {unit}
            </span>
          ))}
        </div>
      )}
      {result.memo && <p className="text-xs text-gray-500 mb-2">{result.memo}</p>}
      <div className="flex gap-3 pt-1 border-t border-gray-50">
        <button onClick={onEdit} className="text-xs text-blue-500 font-medium">수정</button>
        <button onClick={onDelete} className="text-xs text-red-400 font-medium">삭제</button>
      </div>
    </div>
  );
}

function TimelineItem({ item, isLast }) {
  const isEvent = item._kind === 'event';
  const typeInfo = isEvent ? (STUDENT_EVENT_TYPES[item.eventType] || { icon: '📌', label: item.eventType }) : null;
  const examLabel = !isEvent ? (EXAM_TYPES[item.examType] || item.examType) : null;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
          isEvent ? 'bg-amber-100' : 'bg-green-100'
        }`}>
          {isEvent ? typeInfo?.icon : '🏆'}
        </div>
        {!isLast && <div className="w-0.5 bg-gray-100 flex-1 mt-1" style={{ minHeight: 16 }} />}
      </div>
      <div className="flex-1 pb-4 min-w-0">
        <p className="text-xs text-gray-400 mb-0.5">{item.date}</p>
        <p className="text-sm font-semibold text-gray-800">
          {isEvent
            ? (item.title || typeInfo?.label) + (item.subject ? ` · ${item.subject}` : '')
            : `${item.subject} ${examLabel}${item.score !== null && item.score !== undefined ? ` · ${item.score}점` : ''}`
          }
        </p>
        {!isEvent && item.grade && (
          <span className="text-xs text-purple-600 font-medium">{GRADE_LABELS[item.grade] || `${item.grade}등급`}</span>
        )}
        {isEvent && item.memo && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{item.memo}</p>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, children }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wide">{label}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, icon }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs text-gray-400 w-14 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value || '-'}</span>
    </div>
  );
}
