import { useState, useMemo } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { sheetTransition, fadeTransition } from '../../../utils/motion';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';
import EmptyState from '../../../components/EmptyState';
import ClinicFormModal from './ClinicFormModal';
import { today, formatDateShort, getDDay } from '../../../utils/date';

const CLINIC_TYPE_LABELS = {
  homework: '숙제', wrong_answer: '오답', vocabulary: '단어', reading: '본문',
  grammar: '문법', concept: '개념', test_retry: '재시험', absence_makeup: '보강', other: '기타',
};

const STATUS_CONFIG = {
  pending:     { label: '대기',    bg: 'bg-orange-50', color: 'text-orange-600', dot: 'bg-orange-400' },
  in_progress: { label: '진행 중', bg: 'bg-blue-50',   color: 'text-blue-600',   dot: 'bg-blue-400' },
  completed:   { label: '완료',    bg: 'bg-green-50',  color: 'text-green-600',  dot: 'bg-green-400' },
  hold:        { label: '보류',    bg: 'bg-gray-100',  color: 'text-gray-500',   dot: 'bg-gray-300' },
};

const PRIORITY_CONFIG = {
  urgent: { label: '긴급', color: 'bg-red-100 text-red-600' },
  high:   { label: '높음', color: 'bg-orange-50 text-orange-600' },
  normal: { label: '일반', color: 'bg-gray-100 text-gray-500' },
  low:    { label: '낮음', color: 'bg-gray-50 text-gray-400' },
};

const STATUS_FILTERS = ['all', 'pending', 'in_progress', 'completed', 'hold'];
const STATUS_FILTER_LABELS = { all: '전체', pending: '대기', in_progress: '진행 중', completed: '완료', hold: '보류' };

const TYPE_FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'homework', label: '숙제' },
  { id: 'wrong_answer', label: '오답' },
  { id: 'vocabulary', label: '단어' },
  { id: 'reading', label: '본문' },
  { id: 'grammar', label: '문법' },
  { id: 'test_retry', label: '재시험' },
  { id: 'absence_makeup', label: '보강' },
  { id: 'other', label: '기타' },
];

export default function ClinicPage() {
  const {
    role, clinicTasks, academyStudents, classGroups, academyAssistants,
    updateClinicTask, deleteClinicTask, completeClinicTask,
  } = useAcademyStore();

  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [showCompleteSheet, setShowCompleteSheet] = useState(null);
  const [resultMemo, setResultMemo] = useState('');

  const todayStr = today();
  const canCreate = role === 'owner' || role === 'teacher' || role === 'assistant';

  const baseFiltered = useMemo(() => {
    let tasks = clinicTasks;
    if (statusFilter !== 'all') tasks = tasks.filter((t) => t.status === statusFilter);
    if (typeFilter !== 'all') tasks = tasks.filter((t) => t.type === typeFilter);
    return tasks.sort((a, b) => {
      const pri = { urgent: 0, high: 1, normal: 2, low: 3 };
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (b.status === 'completed' && a.status !== 'completed') return -1;
      return (pri[a.priority] ?? 2) - (pri[b.priority] ?? 2);
    });
  }, [clinicTasks, statusFilter, typeFilter]);

  const counts = useMemo(() => ({
    pending:     clinicTasks.filter((t) => t.status === 'pending').length,
    in_progress: clinicTasks.filter((t) => t.status === 'in_progress').length,
    completed:   clinicTasks.filter((t) => t.status === 'completed').length,
    urgent:      clinicTasks.filter((t) => t.priority === 'urgent' && t.status !== 'completed').length,
  }), [clinicTasks]);

  const handleComplete = (taskId) => {
    setShowCompleteSheet(taskId);
    setResultMemo('');
  };

  const confirmComplete = () => {
    if (showCompleteSheet) {
      completeClinicTask(showCompleteSheet, resultMemo);
      setShowCompleteSheet(null);
      setResultMemo('');
      setActiveTaskId(null);
    }
  };

  return (
    <div>
      <Header
        title="클리닉"
        right={
          canCreate ? (
            <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowForm(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white">
              <Plus size={18} />
            </motion.button>
          ) : null
        }
      />

      <div className="pt-14 pb-6">
        {/* 요약 */}
        <div className="px-4 pt-4 grid grid-cols-4 gap-2 mb-4">
          {[
            { label: '대기',    value: counts.pending,     color: 'text-orange-500' },
            { label: '진행 중', value: counts.in_progress, color: 'text-blue-600' },
            { label: '완료',    value: counts.completed,   color: 'text-green-600' },
            { label: '긴급',    value: counts.urgent,      color: 'text-red-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-2xl p-3 shadow-sm text-center">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* 상태 필터 */}
        <div className="px-4 mb-2">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {STATUS_FILTERS.map((f) => (
              <motion.button key={f} whileTap={{ scale: 0.97 }} onClick={() => setStatusFilter(f)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  statusFilter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 border border-gray-200'
                }`}>
                {STATUS_FILTER_LABELS[f]}
              </motion.button>
            ))}
          </div>
        </div>

        {/* 유형 필터 */}
        <div className="px-4 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {TYPE_FILTERS.map(({ id, label }) => (
              <motion.button key={id} whileTap={{ scale: 0.97 }} onClick={() => setTypeFilter(id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  typeFilter === id ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 border border-gray-200'
                }`}>
                {label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* 클리닉 목록 */}
        {baseFiltered.length === 0 ? (
          <EmptyState icon="✅" title="클리닉이 없어요" description="수업 기록에서 보완 항목을 체크하거나 직접 추가해보세요." />
        ) : (
          <div className="px-4 flex flex-col gap-2">
            {baseFiltered.map((task) => {
              const student = academyStudents.find((s) => s.id === task.studentId);
              const group = classGroups.find((g) => g.id === task.classGroupId);
              const assistant = academyAssistants.find((a) => a.id === task.assignedToId);
              const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
              const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;
              const dday = getDDay(task.dueDate);
              const isExpanded = activeTaskId === task.id;

              return (
                <div key={task.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <button
                    className="w-full px-4 py-3.5 text-left"
                    onClick={() => setActiveTaskId(isExpanded ? null : task.id)}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priorityCfg.color}`}>
                        {priorityCfg.label}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                        {CLINIC_TYPE_LABELS[task.type] || '기타'}
                      </span>
                      {dday !== null && dday >= 0 && dday <= 3 && (
                        <span className={`text-xs font-bold ${dday === 0 ? 'text-red-600' : 'text-orange-500'}`}>
                          {dday === 0 ? 'D-Day' : `D-${dday}`}
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900">{student?.name || '학생'} · {task.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      {group && <span>{group.name}</span>}
                      {task.dueDate && <span>마감 {formatDateShort(task.dueDate)}</span>}
                      {assistant && <span>담당 {assistant.name}</span>}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-50">
                      {task.description && (
                        <p className="text-sm text-gray-600 mt-3 mb-3 bg-gray-50 rounded-xl px-3 py-2.5">{task.description}</p>
                      )}
                      {task.resultMemo && (
                        <div className="mb-3 bg-green-50 rounded-xl px-3 py-2.5">
                          <p className="text-xs font-semibold text-green-700 mb-1">처리 결과</p>
                          <p className="text-sm text-green-600">{task.resultMemo}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {task.status === 'pending' && (
                          <motion.button whileTap={{ scale: 0.97 }}
                            onClick={() => updateClinicTask(task.id, { status: 'in_progress' })}
                            className="flex-1 bg-blue-600 text-white text-xs font-bold py-2.5 rounded-xl">
                            진행 시작
                          </motion.button>
                        )}
                        {(task.status === 'pending' || task.status === 'in_progress') && (
                          <motion.button whileTap={{ scale: 0.97 }}
                            onClick={() => handleComplete(task.id)}
                            className="flex-1 bg-green-500 text-white text-xs font-bold py-2.5 rounded-xl">
                            완료 처리
                          </motion.button>
                        )}
                        {(task.status === 'pending' || task.status === 'in_progress') && (
                          <motion.button whileTap={{ scale: 0.97 }}
                            onClick={() => updateClinicTask(task.id, { status: 'hold' })}
                            className="px-4 bg-gray-100 text-gray-600 text-xs font-bold py-2.5 rounded-xl">
                            보류
                          </motion.button>
                        )}
                        {canCreate && (
                          <motion.button whileTap={{ scale: 0.97 }}
                            onClick={() => { setEditTask(task); setActiveTaskId(null); }}
                            className="px-4 bg-gray-100 text-gray-600 text-xs font-bold py-2.5 rounded-xl">
                            수정
                          </motion.button>
                        )}
                        {role === 'owner' && (
                          <motion.button whileTap={{ scale: 0.97 }}
                            onClick={() => deleteClinicTask(task.id)}
                            className="px-4 bg-red-50 text-red-500 text-xs font-bold py-2.5 rounded-xl">
                            삭제
                          </motion.button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 완료 처리 시트 */}
      <AnimatePresence>
        {showCompleteSheet && (
          <>
            <motion.div key="dim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={fadeTransition} className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowCompleteSheet(null)} />
            <motion.div key="sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={sheetTransition}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-4 pt-5 pb-10"
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <p className="text-base font-bold text-gray-900 mb-4">클리닉 완료 처리</p>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">처리 결과 메모 (선택)</p>
                <textarea
                  value={resultMemo}
                  onChange={(e) => setResultMemo(e.target.value)}
                  rows={4}
                  placeholder="처리 결과나 특이사항을 기록해주세요..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>
              <motion.button whileTap={{ scale: 0.97 }} onClick={confirmComplete}
                className="w-full mt-4 bg-green-500 text-white font-bold py-3.5 rounded-xl text-base">
                완료 처리
              </motion.button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {(showForm || editTask) && (
        <ClinicFormModal
          editTask={editTask}
          onClose={() => { setShowForm(false); setEditTask(null); }}
        />
      )}
    </div>
  );
}
