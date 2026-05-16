import { useState } from 'react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const SUBJECTS = ['수학', '영어', '국어', '과학', '사회', '물리', '화학', '역사', '기타'];
const LEVELS = ['초등', '초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', '수능'];

export default function ClassGroupFormModal({ editGroup, onClose }) {
  const { addClassGroup, updateClassGroup, academyStudents, academyTeachers, academyAssistants } = useAcademyStore();

  const [form, setForm] = useState({
    name: editGroup?.name || '',
    subject: editGroup?.subject || '',
    level: editGroup?.level || '',
    teacherId: editGroup?.teacherId || '',
    assistantIds: editGroup?.assistantIds || [],
    studentIds: editGroup?.studentIds || [],
    weekdays: editGroup?.weekdays || [],
    startTime: editGroup?.startTime || '16:00',
    endTime: editGroup?.endTime || '18:00',
    room: editGroup?.room || '',
    startDate: editGroup?.startDate || new Date().toISOString().slice(0, 10),
    endDate: editGroup?.endDate || '',
    monthlyFee: editGroup?.monthlyFee ? String(editGroup.monthlyFee) : '',
    memo: editGroup?.memo || '',
    status: editGroup?.status || 'active',
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleWeekday = (day) =>
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(day) ? f.weekdays.filter((d) => d !== day) : [...f.weekdays, day],
    }));

  const toggleStudent = (id) =>
    setForm((f) => ({
      ...f,
      studentIds: f.studentIds.includes(id) ? f.studentIds.filter((s) => s !== id) : [...f.studentIds, id],
    }));

  const toggleAssistant = (id) =>
    setForm((f) => ({
      ...f,
      assistantIds: f.assistantIds.includes(id) ? f.assistantIds.filter((a) => a !== id) : [...f.assistantIds, id],
    }));

  const handleSave = () => {
    if (!form.name.trim()) return alert('반 이름을 입력해주세요.');
    if (form.weekdays.length === 0) return alert('수업 요일을 선택해주세요.');
    if (!form.startDate) return alert('시작일을 선택해주세요.');

    const data = { ...form, monthlyFee: Number(form.monthlyFee) || 0 };
    if (editGroup) {
      updateClassGroup(editGroup.id, data);
    } else {
      addClassGroup(data);
    }
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editGroup ? '반 정보 수정' : '반 만들기'}
      footer={
        <button onClick={handleSave} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl">
          {editGroup ? '저장' : '반 생성'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="반 이름 *">
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="예: 중2 영어 A반" className="input" />
        </Field>

        <Field label="과목">
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button key={s} type="button" onClick={() => set('subject', s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  form.subject === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                {s}
              </button>
            ))}
          </div>
        </Field>

        <Field label="학년/레벨">
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((l) => (
              <button key={l} type="button" onClick={() => set('level', l)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  form.level === l ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                {l}
              </button>
            ))}
          </div>
        </Field>

        <Field label="수업 요일 *">
          <div className="flex gap-2">
            {WEEKDAYS.map((day) => (
              <button key={day} type="button" onClick={() => toggleWeekday(day)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
                  form.weekdays.includes(day) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'
                }`}>
                {day}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="시작 시간">
            <input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} className="input" />
          </Field>
          <Field label="종료 시간">
            <input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="시작일 *">
            <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className="input" />
          </Field>
          <Field label="종료일">
            <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className="input" />
          </Field>
        </div>

        <Field label="강의실">
          <input value={form.room} onChange={(e) => set('room', e.target.value)} placeholder="예: 1강의실" className="input" />
        </Field>

        <Field label="월 수강료">
          <input type="number" value={form.monthlyFee} onChange={(e) => set('monthlyFee', e.target.value)} placeholder="예: 320000" className="input" />
        </Field>

        {academyTeachers.length > 0 && (
          <Field label="담당 강사">
            <select value={form.teacherId} onChange={(e) => set('teacherId', e.target.value)} className="input">
              <option value="">강사 선택</option>
              {academyTeachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
        )}

        {academyAssistants.length > 0 && (
          <Field label="보조강사">
            <div className="flex flex-wrap gap-2">
              {academyAssistants.map((a) => (
                <button key={a.id} type="button" onClick={() => toggleAssistant(a.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    form.assistantIds.includes(a.id) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'
                  }`}>
                  {a.name}
                </button>
              ))}
            </div>
          </Field>
        )}

        {academyStudents.length > 0 && (
          <Field label="학생 배정">
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
              {academyStudents.map((s) => (
                <button key={s.id} type="button" onClick={() => toggleStudent(s.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                    form.studentIds.includes(s.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                  }`}>
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.studentIds.includes(s.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`} />
                  <span className="text-sm font-medium text-gray-800">{s.name}</span>
                  {s.grade && <span className="text-xs text-gray-400">{s.grade}</span>}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="메모">
          <textarea value={form.memo} onChange={(e) => set('memo', e.target.value)} rows={2} placeholder="특이사항 등" className="input resize-none" />
        </Field>

        {!editGroup && (
          <div className="bg-blue-50 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-700 font-semibold mb-1">수업 회차 자동 생성</p>
            <p className="text-xs text-blue-600">
              선택한 요일과 시작일 기준으로 {form.endDate ? '종료일까지' : '3개월치'} 수업 회차가 자동으로 만들어집니다.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
