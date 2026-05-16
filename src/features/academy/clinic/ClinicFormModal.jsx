import { useState } from 'react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import { today } from '../../../utils/date';

const CLINIC_TYPES = [
  { id: 'homework',       label: '숙제 미완료' },
  { id: 'wrong_answer',   label: '오답 풀이' },
  { id: 'vocabulary',     label: '단어 재시험' },
  { id: 'reading',        label: '본문 암기' },
  { id: 'grammar',        label: '문법 보충' },
  { id: 'concept',        label: '개념 재설명' },
  { id: 'test_retry',     label: '재시험' },
  { id: 'absence_makeup', label: '결석 보강' },
  { id: 'other',          label: '기타' },
];

const PRIORITIES = [
  { id: 'low',    label: '낮음' },
  { id: 'normal', label: '일반' },
  { id: 'high',   label: '높음' },
  { id: 'urgent', label: '긴급' },
];

export default function ClinicFormModal({ classGroupId, classSessionId, presetStudentId, editTask, onClose }) {
  const { addClinicTask, updateClinicTask, academyStudents, academyAssistants, classGroups, role } = useAcademyStore();

  const studentsInGroup = classGroupId
    ? academyStudents.filter((s) => {
        const group = classGroups.find((g) => g.id === classGroupId);
        return group?.studentIds?.includes(s.id);
      })
    : academyStudents;

  const [form, setForm] = useState({
    studentId: editTask?.studentId || presetStudentId || '',
    classGroupId: editTask?.classGroupId || classGroupId || '',
    classSessionId: editTask?.classSessionId || classSessionId || '',
    type: editTask?.type || 'wrong_answer',
    title: editTask?.title || '',
    description: editTask?.description || '',
    assignedToId: editTask?.assignedToId || '',
    priority: editTask?.priority || 'normal',
    dueDate: editTask?.dueDate || today(),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.studentId) return alert('학생을 선택해주세요.');
    if (!form.title.trim()) return alert('제목을 입력해주세요.');

    if (editTask) {
      updateClinicTask(editTask.id, form);
    } else {
      addClinicTask({ ...form, requestedByRole: role, requestedById: role });
    }
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editTask ? '클리닉 수정' : '클리닉 요청'}
      footer={
        <button onClick={handleSave} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl">
          {editTask ? '저장' : '클리닉 요청'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">학생 *</label>
          <select value={form.studentId} onChange={(e) => set('studentId', e.target.value)} className="input">
            <option value="">학생 선택</option>
            {studentsInGroup.map((s) => (
              <option key={s.id} value={s.id}>{s.name} {s.grade ? `(${s.grade})` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">유형</label>
          <div className="flex flex-wrap gap-2">
            {CLINIC_TYPES.map((t) => (
              <button key={t.id} type="button" onClick={() => set('type', t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  form.type === t.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">제목 *</label>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="예: 관계대명사 오답 재풀이" className="input" />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">설명</label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
            rows={3} placeholder="구체적인 내용이나 요청사항을 입력하세요" className="input resize-none" />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">우선순위</label>
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map((p) => (
              <button key={p.id} type="button" onClick={() => set('priority', p.id)}
                className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-colors ${
                  form.priority === p.id
                    ? p.id === 'urgent' ? 'border-red-500 bg-red-50 text-red-700'
                      : p.id === 'high' ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-500'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">마감일</label>
          <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} className="input" />
        </div>

        {academyAssistants.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">담당 보조강사</label>
            <select value={form.assignedToId} onChange={(e) => set('assignedToId', e.target.value)} className="input">
              <option value="">미지정</option>
              {academyAssistants.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}
