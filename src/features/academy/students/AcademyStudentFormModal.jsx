import { useState } from 'react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import { formatPhoneNumber } from '../../../utils/format';

const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', 'N수생', '성인'];

export default function AcademyStudentFormModal({ editStudent, onClose }) {
  const { addAcademyStudent, updateAcademyStudent } = useAcademyStore();
  const [form, setForm] = useState({
    name: editStudent?.name || '',
    grade: editStudent?.grade || '',
    school: editStudent?.school || '',
    phone: editStudent?.phone || '',
    parentPhone: editStudent?.parentPhone || '',
    parentName: editStudent?.parentName || '',
    memo: editStudent?.memo || '',
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name.trim()) return alert('이름을 입력해주세요.');
    if (editStudent) {
      updateAcademyStudent(editStudent.id, form);
    } else {
      addAcademyStudent(form);
    }
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editStudent ? '학생 수정' : '학생 등록'}
      footer={
        <button onClick={handleSave} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl">
          {editStudent ? '저장' : '등록'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">이름 *</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="홍길동" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">학년</label>
          <div className="flex flex-wrap gap-2">
            {GRADES.map((g) => (
              <button key={g} type="button" onClick={() => set('grade', g)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  form.grade === g ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                {g}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">학교</label>
          <input value={form.school} onChange={(e) => set('school', e.target.value)} placeholder="서울중학교" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">학생 연락처</label>
          <input inputMode="tel" value={form.phone} onChange={(e) => set('phone', formatPhoneNumber(e.target.value))} placeholder="010-0000-0000" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">학부모 이름</label>
          <input value={form.parentName} onChange={(e) => set('parentName', e.target.value)} placeholder="홍부모" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">학부모 연락처</label>
          <input inputMode="tel" value={form.parentPhone} onChange={(e) => set('parentPhone', formatPhoneNumber(e.target.value))} placeholder="010-0000-0000" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
          <textarea value={form.memo} onChange={(e) => set('memo', e.target.value)} rows={2} placeholder="특이사항 등" className="input resize-none" />
        </div>
      </div>
    </Modal>
  );
}
