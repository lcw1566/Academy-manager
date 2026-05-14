import { useState } from 'react';
import { Trash2, MapPin, Clock, Pencil } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import AttendancePanel from '../attendance/AttendancePanel';
import LessonNotePanel, { SharedNoteSection } from '../notes/LessonNotePanel';
import EditClassModal from './EditClassModal';
import { formatDateShort } from '../../utils/date';
import { classTypeColors } from '../../utils/format';

const TABS = [
  { id: 'attendance', label: '출결' },
  { id: 'record',     label: '수업 기록' },
];

export default function ClassDetailPage() {
  const { selectedClassId, classes, students, goBackFromClass, deleteClass } = useAcademyStore();

  const cls = classes.find((c) => c.id === selectedClassId);
  const [activeTab, setActiveTab] = useState('attendance');
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  if (!cls) {
    return (
      <div className="pt-14 p-4 text-center text-gray-500">
        수업을 찾을 수 없습니다.
        <button onClick={goBackFromClass} className="block mt-4 text-blue-600 mx-auto">돌아가기</button>
      </div>
    );
  }

  const clsStudents = students.filter((s) => cls.studentIds.includes(s.id));
  const isMultiStudent = clsStudents.length > 1;
  const effectiveStudentId = selectedStudentId || clsStudents[0]?.id || null;

  const handleDelete = () => {
    if (window.confirm('이 수업을 삭제할까요?')) {
      deleteClass(cls.id);
      goBackFromClass();
    }
  };

  return (
    <div>
      <Header
        title={cls.name}
        onBack={goBackFromClass}
        right={
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => setShowEdit(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100"
          >
            <Pencil size={15} className="text-gray-600" />
          </motion.button>
        }
      />

      <div className="pt-14">
        {/* 수업 정보 카드 */}
        <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${classTypeColors[cls.type] || 'bg-gray-100 text-gray-600'}`}>
              {cls.type}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock size={14} className="text-gray-400 flex-shrink-0" />
              {formatDateShort(cls.date)} · {cls.startTime} – {cls.endTime}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin size={14} className="text-gray-400 flex-shrink-0" />
              {cls.location || '장소 미설정'}
            </div>
          </div>
          {cls.memo && (
            <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">{cls.memo}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {clsStudents.map((s) => (
              <span key={s.id} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">
                {s.name}
              </span>
            ))}
          </div>
        </div>

        {/* 탭 */}
        <div className="mx-4 mt-4 flex gap-0 bg-gray-100 rounded-xl p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === t.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pb-6">
          {activeTab === 'attendance' && (
            <div className="mx-4 mt-4">
              <AttendancePanel cls={cls} />
            </div>
          )}

          {activeTab === 'record' && (
            <>
              {isMultiStudent && <SharedNoteSection cls={cls} />}
              {isMultiStudent && (
                <div className="mx-4 mt-4">
                  <p className="text-xs font-bold text-gray-500 mb-2">학생별 기록 선택</p>
                  <div className="flex gap-2 flex-wrap">
                    {clsStudents.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStudentId(s.id)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          effectiveStudentId === s.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-600 border border-gray-200'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {effectiveStudentId && (
                <div className="mx-4 mt-4">
                  <LessonNotePanel
                    cls={cls}
                    studentId={effectiveStudentId}
                    groupMode={isMultiStudent}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* 삭제 */}
        <div className="mx-4 mb-6">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleDelete}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-red-500 text-sm font-medium bg-red-50"
          >
            <Trash2 size={15} />
            수업 삭제
          </motion.button>
        </div>
      </div>

      {showEdit && (
        <EditClassModal classId={cls.id} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}
