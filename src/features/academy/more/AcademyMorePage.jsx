import { useState } from 'react';
import { LogOut, Plus, Trash2, Pencil, AlertTriangle, ChevronRight, RotateCcw } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import { roleMap, formatPhoneNumber } from '../../../utils/format';

const WAGE_TYPES = [
  { id: 'hourly',  label: '시급' },
  { id: 'monthly', label: '월급' },
];

export default function AcademyMorePage() {
  const {
    role, logout,
    academyProfile, setAcademyProfile,
    academyTeachers, addTeacher, updateTeacher, deleteTeacher,
    academyAssistants, addAssistant, updateAssistant, deleteAssistant,
    resetAcademyData, generateAcademySampleData,
    showToast,
  } = useAcademyStore();

  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [editTeacher, setEditTeacher] = useState(null);
  const [showAssistantForm, setShowAssistantForm] = useState(false);
  const [editAssistant, setEditAssistant] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const isOwner = role === 'owner';

  return (
    <div>
      <Header title="더보기" />
      <div className="pt-14 pb-6">

        {/* 학원 프로필 */}
        <button
          onClick={() => isOwner && setShowProfileEdit(true)}
          className="mx-4 mt-4 w-[calc(100%-2rem)] bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left active:scale-[0.97] transition-transform"
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">
            🏫
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900">{academyProfile?.name || '학원'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{roleMap[role]}</p>
            {academyProfile?.phone && <p className="text-xs text-gray-400 mt-0.5">{academyProfile.phone}</p>}
          </div>
          {isOwner && <ChevronRight size={16} className="text-gray-300" />}
        </button>

        {/* 강사 관리 (원장만) */}
        {isOwner && (
          <div className="mx-4 mt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-700">강사 관리</p>
              <button onClick={() => setShowTeacherForm(true)}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
                <Plus size={12} />추가
              </button>
            </div>
            {academyTeachers.length === 0 ? (
              <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
                <p className="text-sm text-gray-400">등록된 강사가 없어요</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {academyTeachers.map((teacher) => (
                  <div key={teacher.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0">
                    <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-600 flex-shrink-0">
                      {teacher.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 text-sm">{teacher.name}</p>
                      <p className="text-xs text-gray-400">
                        {teacher.subjects?.join(', ')}
                        {teacher.subjects?.length > 0 && ' · '}
                        {{ active: '재직 중', leave: '휴직', inactive: '퇴직' }[teacher.status || 'active']}
                        {teacher.wageType === 'hourly' && teacher.hourlyWage ? ` · 시급 ${teacher.hourlyWage.toLocaleString()}원` : ''}
                        {teacher.wageType === 'monthly' && teacher.monthlyWage ? ` · 월급 ${teacher.monthlyWage.toLocaleString()}원` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditTeacher(teacher); setShowTeacherForm(true); }}
                        className="w-7 h-7 flex items-center justify-center rounded-full active:bg-gray-100">
                        <Pencil size={13} className="text-gray-400" />
                      </button>
                      <button onClick={() => { if (window.confirm('강사를 삭제할까요?')) deleteTeacher(teacher.id); }}
                        className="w-7 h-7 flex items-center justify-center rounded-full active:bg-gray-100">
                        <Trash2 size={13} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 보조강사 관리 (원장만) */}
        {isOwner && (
          <div className="mx-4 mt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-700">보조강사 관리</p>
              <button onClick={() => setShowAssistantForm(true)}
                className="flex items-center gap-1 text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full">
                <Plus size={12} />추가
              </button>
            </div>
            {academyAssistants.length === 0 ? (
              <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
                <p className="text-sm text-gray-400">등록된 보조강사가 없어요</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {academyAssistants.map((assistant) => {
                  const statusLabel = { active: '재직 중', leave: '휴직', inactive: '퇴사' }[assistant.status || 'active'];
                  const statusColor = STATUS_COLORS[assistant.status || 'active'];
                  const wageInfo = assistant.wageType === 'monthly'
                    ? `월급 ${(assistant.monthlySalary || 0).toLocaleString()}원`
                    : `시급 ${(assistant.hourlyWage || 0).toLocaleString()}원`;
                  return (
                    <div key={assistant.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0">
                      <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0">
                        {assistant.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 text-sm">{assistant.name}</p>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusColor}`}>{statusLabel}</span>
                        </div>
                        {(assistant.subjects?.length > 0 || assistant.taskTypes?.length > 0) && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {[...(assistant.subjects || []), ...(assistant.taskTypes || [])].join(' · ')}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">{wageInfo} · {assistant.phone || '연락처 없음'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditAssistant(assistant); setShowAssistantForm(true); }}
                          className="w-7 h-7 flex items-center justify-center rounded-full active:bg-gray-100">
                          <Pencil size={13} className="text-gray-400" />
                        </button>
                        <button onClick={() => { if (window.confirm('보조강사를 삭제할까요?')) deleteAssistant(assistant.id); }}
                          className="w-7 h-7 flex items-center justify-center rounded-full active:bg-gray-100">
                          <Trash2 size={13} className="text-red-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 샘플 데이터 / 초기화 (원장만) */}
        {isOwner && (
          <div className="mx-4 mt-5">
            <p className="text-sm font-bold text-gray-700 mb-3">데이터 관리</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => generateAcademySampleData()}
                className="w-full flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3.5 text-left active:bg-blue-100">
                <RotateCcw size={16} className="text-blue-500" />
                <div>
                  <p className="text-sm font-bold text-blue-600">샘플 데이터 생성</p>
                  <p className="text-xs text-blue-400 mt-0.5">테스트용 반/학생/클리닉 데이터를 만들어요</p>
                </div>
              </button>
              <button onClick={() => setShowResetConfirm(true)}
                className="w-full flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3.5 text-left active:bg-red-100">
                <Trash2 size={16} className="text-red-500" />
                <div>
                  <p className="text-sm font-bold text-red-600">학원 데이터 초기화</p>
                  <p className="text-xs text-red-400 mt-0.5">학원 데이터 전체를 삭제해요</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* 역할 변경 */}
        <div className="mx-4 mt-5">
          <button onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white shadow-sm text-gray-600 text-sm font-medium">
            <LogOut size={16} />
            역할 변경
          </button>
        </div>
      </div>

      {/* 학원 프로필 수정 */}
      {showProfileEdit && (
        <AcademyProfileModal
          profile={academyProfile}
          onClose={() => setShowProfileEdit(false)}
          onSave={(data) => { setAcademyProfile(data); showToast('학원 정보가 저장되었습니다.'); setShowProfileEdit(false); }}
        />
      )}

      {/* 강사 폼 */}
      {showTeacherForm && (
        <TeacherFormModal
          editTeacher={editTeacher}
          onClose={() => { setShowTeacherForm(false); setEditTeacher(null); }}
          onSave={(data) => {
            if (editTeacher) updateTeacher(editTeacher.id, data);
            else addTeacher(data);
            setShowTeacherForm(false); setEditTeacher(null);
          }}
        />
      )}

      {/* 보조강사 폼 */}
      {showAssistantForm && (
        <AssistantFormModal
          editAssistant={editAssistant}
          onClose={() => { setShowAssistantForm(false); setEditAssistant(null); }}
          onSave={(data) => {
            if (editAssistant) updateAssistant(editAssistant.id, data);
            else addAssistant(data);
            setShowAssistantForm(false); setEditAssistant(null);
          }}
        />
      )}

      {/* 초기화 확인 */}
      <Modal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="학원 데이터 초기화"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">취소</button>
            <button onClick={() => { resetAcademyData(); setShowResetConfirm(false); }} className="flex-1 py-3.5 rounded-xl bg-red-500 text-white text-sm font-bold">초기화</button>
          </div>
        }
      >
        <div className="bg-red-50 rounded-2xl px-4 py-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 mb-1">되돌릴 수 없어요</p>
            <p className="text-xs text-red-500">학원 학생, 반, 수업 회차, 클리닉, 강사 데이터가 모두 삭제됩니다.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AcademyProfileModal({ profile, onClose, onSave }) {
  const [form, setForm] = useState({ name: profile?.name || '', address: profile?.address || '', phone: profile?.phone || '' });
  return (
    <Modal isOpen onClose={onClose} title="학원 정보 수정"
      footer={<button onClick={() => onSave(form)} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl">저장</button>}>
      <div className="flex flex-col gap-4">
        <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">학원 이름</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="우리 학원" className="input" /></div>
        <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">주소</label>
          <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="서울시 강남구..." className="input" /></div>
        <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">연락처</label>
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))} placeholder="02-0000-0000" className="input" /></div>
      </div>
    </Modal>
  );
}

const SUBJECTS = ['수학', '영어', '국어', '과학', '사회', '물리', '화학', '역사', '기타'];

function TeacherFormModal({ editTeacher, onClose, onSave }) {
  const [form, setForm] = useState({
    name: editTeacher?.name || '',
    phone: editTeacher?.phone || '',
    subjects: editTeacher?.subjects || [],
    wageType: editTeacher?.wageType || 'hourly',
    hourlyWage: editTeacher?.hourlyWage ? String(editTeacher.hourlyWage) : '',
    monthlyWage: editTeacher?.monthlyWage ? String(editTeacher.monthlyWage) : '',
    status: editTeacher?.status || 'active',
  });
  const toggleSubject = (s) => setForm((f) => ({ ...f, subjects: f.subjects.includes(s) ? f.subjects.filter((x) => x !== s) : [...f.subjects, s] }));

  return (
    <Modal isOpen onClose={onClose} title={editTeacher ? '강사 수정' : '강사 추가'}
      footer={<button onClick={() => { if (!form.name.trim()) return alert('이름을 입력해주세요.'); onSave({ ...form, hourlyWage: Number(form.hourlyWage), monthlyWage: Number(form.monthlyWage) }); }} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl">저장</button>}>
      <div className="flex flex-col gap-4">
        <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">이름 *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="홍강사" className="input" /></div>
        <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">연락처</label>
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))} placeholder="010-0000-0000" className="input" /></div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">담당 과목</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button key={s} type="button" onClick={() => toggleSubject(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${form.subjects.includes(s) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">급여 방식</label>
          <div className="grid grid-cols-2 gap-2">
            {WAGE_TYPES.map((w) => (
              <button key={w.id} type="button" onClick={() => setForm((f) => ({ ...f, wageType: w.id }))}
                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${form.wageType === w.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'}`}>{w.label}</button>
            ))}
          </div>
          {form.wageType === 'hourly' && (
            <input type="number" value={form.hourlyWage} onChange={(e) => setForm((f) => ({ ...f, hourlyWage: e.target.value }))} placeholder="시급 (원)" className="input mt-2" />
          )}
          {form.wageType === 'monthly' && (
            <input type="number" value={form.monthlyWage} onChange={(e) => setForm((f) => ({ ...f, monthlyWage: e.target.value }))} placeholder="월급 (원)" className="input mt-2" />
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">재직 상태</label>
          <div className="grid grid-cols-2 gap-2">
            {[{ id: 'active', label: '재직 중' }, { id: 'inactive', label: '퇴직' }].map((s) => (
              <button key={s.id} type="button" onClick={() => setForm((f) => ({ ...f, status: s.id }))}
                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${form.status === s.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'}`}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

const TASK_TYPES = ['숙제 검사', '오답 풀이', '단어 테스트', '본문 암기', '문법 보충', '개념 보충', '재시험', '기타'];

const STATUS_OPTIONS = [
  { id: 'active',   label: '재직 중' },
  { id: 'leave',    label: '휴직' },
  { id: 'inactive', label: '퇴사' },
];
const STATUS_COLORS = { active: 'text-green-600 bg-green-50', leave: 'text-orange-500 bg-orange-50', inactive: 'text-gray-500 bg-gray-100' };

function AssistantFormModal({ editAssistant, onClose, onSave }) {
  const [form, setForm] = useState({
    name: editAssistant?.name || '',
    phone: editAssistant?.phone || '',
    subjects: editAssistant?.subjects || [],
    taskTypes: editAssistant?.taskTypes || [],
    wageType: editAssistant?.wageType || 'hourly',
    hourlyWage: editAssistant?.hourlyWage ? String(editAssistant.hourlyWage) : '',
    monthlySalary: editAssistant?.monthlySalary ? String(editAssistant.monthlySalary) : '',
    status: editAssistant?.status || 'active',
    memo: editAssistant?.memo || '',
  });
  const toggle = (key, val) => setForm((f) => ({ ...f, [key]: f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val] }));

  return (
    <Modal isOpen onClose={onClose} title={editAssistant ? '보조강사 수정' : '보조강사 추가'}
      footer={
        <button onClick={() => {
          if (!form.name.trim()) return alert('이름을 입력해주세요.');
          onSave({ ...form, hourlyWage: Number(form.hourlyWage) || 0, monthlySalary: Number(form.monthlySalary) || 0 });
        }} className="w-full bg-purple-600 text-white font-bold py-3.5 rounded-xl">저장</button>
      }>
      <div className="flex flex-col gap-4">
        {/* 기본 정보 */}
        <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">이름 *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="홍보조" className="input" /></div>
        <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">연락처</label>
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))} placeholder="010-0000-0000" className="input" /></div>

        {/* 재직 상태 */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">재직 상태</label>
          <div className="grid grid-cols-3 gap-2">
            {STATUS_OPTIONS.map((s) => (
              <button key={s.id} type="button" onClick={() => setForm((f) => ({ ...f, status: s.id }))}
                className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-colors ${form.status === s.id ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 담당 과목 */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">담당 과목</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button key={s} type="button" onClick={() => toggle('subjects', s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${form.subjects.includes(s) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}>{s}</button>
            ))}
          </div>
        </div>

        {/* 담당 업무 */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">담당 업무</label>
          <div className="flex flex-wrap gap-2">
            {TASK_TYPES.map((t) => (
              <button key={t} type="button" onClick={() => toggle('taskTypes', t)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${form.taskTypes.includes(t) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}>{t}</button>
            ))}
          </div>
        </div>

        {/* 급여 */}
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">급여 방식</label>
          <div className="grid grid-cols-2 gap-2">
            {WAGE_TYPES.map((w) => (
              <button key={w.id} type="button" onClick={() => setForm((f) => ({ ...f, wageType: w.id }))}
                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${form.wageType === w.id ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 bg-white text-gray-500'}`}>{w.label}</button>
            ))}
          </div>
          {form.wageType === 'hourly' && (
            <input type="number" value={form.hourlyWage} onChange={(e) => setForm((f) => ({ ...f, hourlyWage: e.target.value }))} placeholder="시급 (원)" className="input mt-2" />
          )}
          {form.wageType === 'monthly' && (
            <input type="number" value={form.monthlySalary} onChange={(e) => setForm((f) => ({ ...f, monthlySalary: e.target.value }))} placeholder="월급 (원)" className="input mt-2" />
          )}
        </div>

        {/* 메모 */}
        <div><label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
          <textarea value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} rows={2} placeholder="특이사항 등" className="input resize-none" /></div>
      </div>
    </Modal>
  );
}
