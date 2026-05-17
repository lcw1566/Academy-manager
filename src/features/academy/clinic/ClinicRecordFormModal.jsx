import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAcademyStore from '../../../store/useAcademyStore';
import { today } from '../../../utils/date';
import { getClinicOptions, subjectToKey } from '../../../constants/clinicOptions';

const SUBJECTS = ['국어', '수학', '영어', '과학', '사회', '기타'];

export default function ClinicRecordFormModal({
  editRecord,
  onClose,
  presetStudentId,
  presetDate,
  presetSubject,
  presetClassGroupId,
  presetClassSessionId,
}) {
  const {
    addClinicRecord, updateClinicRecord,
    academyStudents, classGroups, academyTeachers, academyAssistants, role,
  } = useAcademyStore();

  const [studentId, setStudentId] = useState(editRecord?.studentId || presetStudentId || '');
  const [date, setDate] = useState(editRecord?.date || presetDate || today());
  const [subject, setSubject] = useState(editRecord?.subject || presetSubject || '');
  const [classGroupId, setClassGroupId] = useState(editRecord?.classGroupId || presetClassGroupId || '');
  const [classSessionId] = useState(editRecord?.classSessionId || presetClassSessionId || '');
  const [selectedItems, setSelectedItems] = useState(editRecord?.items || []);
  const [overallMemo, setOverallMemo] = useState(editRecord?.overallMemo || '');
  const [customItemDraft, setCustomItemDraft] = useState({ title: '', description: '' });
  const [showCustomInput, setShowCustomInput] = useState(false);

  const clinicOptions = subject ? getClinicOptions(subject) : [];

  const isItemSelected = (key) => selectedItems.some((i) => i.categoryKey === key);

  const togglePresetItem = (option) => {
    if (isItemSelected(option.key)) {
      setSelectedItems((prev) => prev.filter((i) => i.categoryKey !== option.key));
    } else {
      setSelectedItems((prev) => [
        ...prev,
        {
          id: `item_${Date.now()}_${option.key}`,
          categoryKey: option.key,
          title: option.title,
          description: '',
          result: '',
          memo: '',
        },
      ]);
    }
  };

  const addCustomItem = () => {
    if (!customItemDraft.title.trim()) return;
    setSelectedItems((prev) => [
      ...prev,
      {
        id: `item_custom_${Date.now()}`,
        categoryKey: 'custom',
        title: customItemDraft.title.trim(),
        description: customItemDraft.description.trim(),
        result: '',
        memo: '',
      },
    ]);
    setCustomItemDraft({ title: '', description: '' });
    setShowCustomInput(false);
  };

  const updateItemField = (id, field, value) => {
    setSelectedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const removeItem = (id) => {
    setSelectedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = () => {
    if (!studentId) return alert('학생을 선택해주세요.');
    if (!date) return alert('날짜를 선택해주세요.');
    if (!subject) return alert('과목을 선택해주세요.');
    if (selectedItems.length === 0) return alert('클리닉 항목을 최소 1개 선택해주세요.');

    // MVP: 첫 번째 강사/보조강사 레코드를 본인으로 간주 (계정 연동 전까지)
    const createdById = role === 'teacher'
      ? (academyTeachers[0]?.id || '')
      : role === 'assistant'
        ? (academyAssistants[0]?.id || '')
        : '';

    const payload = {
      studentId,
      date,
      subject,
      classGroupId: classGroupId || '',
      classSessionId: classSessionId || '',
      items: selectedItems,
      overallMemo,
      createdByRole: role,
      createdById,
    };

    if (editRecord) {
      updateClinicRecord(editRecord.id, payload);
    } else {
      addClinicRecord(payload);
    }
    onClose();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
          <X size={20} className="text-gray-500" />
        </button>
        <p className="text-base font-bold text-gray-900">{editRecord ? '클리닉 기록 수정' : '클리닉 기록 추가'}</p>
        <button
          onClick={handleSave}
          className="text-sm font-bold text-blue-600 px-3 py-1.5 rounded-xl active:bg-blue-50"
        >
          저장
        </button>
      </div>

      {/* 폼 내용 스크롤 */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 flex flex-col gap-5">

          {/* 학생 선택 */}
          <FormSection label="학생 *">
            <div className="relative">
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="input appearance-none pr-8"
              >
                <option value="">학생 선택</option>
                {academyStudents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} {s.grade ? `(${s.grade})` : ''}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </FormSection>

          {/* 날짜 */}
          <FormSection label="날짜 *">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input"
            />
          </FormSection>

          {/* 과목 */}
          <FormSection label="과목 *">
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSubject(s); setSelectedItems([]); }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                    subject === s
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </FormSection>

          {/* 반 연결 (선택) */}
          {classGroups.length > 0 && (
            <FormSection label="반 연결 (선택)">
              <div className="relative">
                <select
                  value={classGroupId}
                  onChange={(e) => setClassGroupId(e.target.value)}
                  className="input appearance-none pr-8"
                >
                  <option value="">반 선택 안 함</option>
                  {classGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </FormSection>
          )}

          {/* 클리닉 항목 선택 */}
          {subject && (
            <FormSection label="클리닉 항목 선택 *">
              <div className="flex flex-col gap-2">
                {clinicOptions.map((option) => {
                  const selected = isItemSelected(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => togglePresetItem(option)}
                      className={`w-full text-left px-4 py-3 rounded-2xl border-2 transition-colors ${
                        selected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-bold ${selected ? 'text-blue-700' : 'text-gray-800'}`}>
                          {option.title}
                        </p>
                        {selected && (
                          <span className="text-xs text-blue-500 font-semibold">선택됨</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{option.description}</p>
                    </button>
                  );
                })}

                {/* 직접 추가 */}
                {!showCustomInput ? (
                  <button
                    type="button"
                    onClick={() => setShowCustomInput(true)}
                    className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 text-sm font-semibold"
                  >
                    <Plus size={16} />
                    직접 추가
                  </button>
                ) : (
                  <div className="border-2 border-blue-200 rounded-2xl p-4 bg-blue-50">
                    <p className="text-xs font-bold text-blue-700 mb-2">직접 추가</p>
                    <input
                      value={customItemDraft.title}
                      onChange={(e) => setCustomItemDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="항목명 *"
                      className="input mb-2"
                    />
                    <input
                      value={customItemDraft.description}
                      onChange={(e) => setCustomItemDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder="설명 (선택)"
                      className="input mb-2"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={addCustomItem}
                        className="flex-1 bg-blue-600 text-white text-xs font-bold py-2.5 rounded-xl"
                      >
                        추가
                      </button>
                      <button
                        onClick={() => { setShowCustomInput(false); setCustomItemDraft({ title: '', description: '' }); }}
                        className="px-4 bg-white text-gray-500 text-xs font-bold py-2.5 rounded-xl border border-gray-200"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </FormSection>
          )}

          {/* 선택된 항목별 세부 기록 */}
          {selectedItems.length > 0 && (
            <FormSection label="항목별 세부 기록">
              <div className="flex flex-col gap-4">
                {selectedItems.map((item) => (
                  <div key={item.id} className="bg-gray-50 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-bold text-gray-800">{item.title}</p>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 text-gray-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 mb-1 block">구체적으로 무엇을 했나요?</label>
                        <textarea
                          value={item.description}
                          onChange={(e) => updateItemField(item.id, 'description', e.target.value)}
                          rows={3}
                          placeholder="세부 활동 내용을 기록해주세요..."
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 resize-none bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 mb-1 block">결과 (선택)</label>
                        <input
                          value={item.result}
                          onChange={(e) => updateItemField(item.id, 'result', e.target.value)}
                          placeholder="예: 24/30, 통과, 미통과"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-500 mb-1 block">메모 (선택)</label>
                        <textarea
                          value={item.memo}
                          onChange={(e) => updateItemField(item.id, 'memo', e.target.value)}
                          rows={2}
                          placeholder="특이사항이나 다음 시간을 위한 메모..."
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 resize-none bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </FormSection>
          )}

          {/* 전체 메모 */}
          <FormSection label="전체 메모 (선택)">
            <textarea
              value={overallMemo}
              onChange={(e) => setOverallMemo(e.target.value)}
              rows={3}
              placeholder="전반적인 클리닉 소견이나 다음 시간 주의사항을 입력하세요..."
              className="input resize-none"
            />
          </FormSection>

          <div className="h-4" />
        </div>
      </div>

      {/* 하단 저장 버튼 */}
      <div className="px-4 py-4 border-t border-gray-100 bg-white">
        <button
          onClick={handleSave}
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl text-base"
        >
          {editRecord ? '수정 저장' : '클리닉 기록 저장'}
        </button>
      </div>
    </div>,
    document.body
  );
}

function FormSection({ label, children }) {
  return (
    <div>
      <label className="text-xs font-bold text-gray-600 mb-2 block">{label}</label>
      {children}
    </div>
  );
}
