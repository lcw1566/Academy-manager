import { useState } from 'react';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import Modal from '../../components/Modal';
import useAcademyStore from '../../store/useAcademyStore';

const SINGLE_TYPES = ['단발 수업', '보강', '상담'];

export default function EditClassModal({ classId, onClose }) {
  const { classes, students, updateClass } = useAcademyStore();
  const cls = classes.find((c) => c.id === classId);

  const [selectedStudentIds, setSelectedStudentIds] = useState(cls?.studentIds || []);
  const [form, setForm] = useState({
    name: cls?.name || '',
    subject: cls?.subject || '',
    type: cls?.type || '단발 수업',
    date: cls?.date || '',
    startTime: cls?.startTime || '',
    endTime: cls?.endTime || '',
    location: cls?.location || '',
    memo: cls?.memo || '',
  });

  if (!cls) return null;

  const setF = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const toggleStudent = (id) =>
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  const handleSave = () => {
    if (selectedStudentIds.length === 0) return alert('학생을 선택해주세요.');
    if (!form.date) return alert('날짜를 입력해주세요.');

    const firstStudentName =
      students.find((s) => s.id === selectedStudentIds[0])?.name || '';
    const autoName = form.subject
      ? `${firstStudentName} ${form.subject} ${form.type}`
      : `${firstStudentName} ${form.type}`;

    updateClass(classId, {
      ...form,
      studentIds: selectedStudentIds,
      name: form.name.trim() || autoName,
    });
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="수업 수정"
      footer={
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl text-base"
        >
          수정 완료
        </motion.button>
      }
    >
      <p className="text-sm text-gray-400 mb-5">바꾸고 싶은 정보를 수정해주세요.</p>

      <div className="flex flex-col gap-4">
        {/* 학생 */}
        <Section label="학생">
          {students.length === 0 ? (
            <p className="text-xs text-yellow-700 bg-yellow-50 rounded-xl px-4 py-3">먼저 학생을 등록해주세요</p>
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-gray-200 p-2 bg-white">
              {students.map((s) => {
                const selected = selectedStudentIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStudent(s.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                      selected ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                      selected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white'
                    }`}>
                      {selected && <Check size={11} className="text-white" />}
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        {/* 수업 유형 */}
        <Section label="수업 유형">
          <div className="flex gap-2">
            {SINGLE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setF('type', t)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                  form.type === t
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Section>

        {/* 과목 */}
        <Section label="과목">
          <input
            value={form.subject}
            onChange={(e) => setF('subject', e.target.value)}
            placeholder="수학, 영어 등"
            className="input"
          />
        </Section>

        {/* 날짜 */}
        <Section label="날짜">
          <input type="date" value={form.date} onChange={(e) => setF('date', e.target.value)} className="input" />
        </Section>

        {/* 시간 */}
        <div className="grid grid-cols-2 gap-3">
          <Section label="시작 시간">
            <input type="time" value={form.startTime} onChange={(e) => setF('startTime', e.target.value)} className="input" />
          </Section>
          <Section label="종료 시간">
            <input type="time" value={form.endTime} onChange={(e) => setF('endTime', e.target.value)} className="input" />
          </Section>
        </div>

        {/* 장소 */}
        <Section label="장소">
          <input
            value={form.location}
            onChange={(e) => setF('location', e.target.value)}
            placeholder="학생 자택, 카페 등"
            className="input"
          />
        </Section>

        {/* 메모 */}
        <Section label="메모">
          <textarea
            value={form.memo}
            onChange={(e) => setF('memo', e.target.value)}
            rows={2}
            className="input"
          />
        </Section>
      </div>
    </Modal>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
