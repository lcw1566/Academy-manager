import { useState } from 'react';
import { LogOut, Plus, Trash2, AlertTriangle, ChevronRight, RotateCcw, ChevronLeft, Pencil } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';
import Modal from '../../../components/Modal';
import { roleMap, formatPhoneNumber } from '../../../utils/format';
import { TASK_TYPE_LABELS, WAGE_TYPE_LABELS, SUBJECT_LABELS } from '../../../constants/labels';

const WAGE_TYPES = [
  { id: 'hourly', label: '시급' },
  { id: 'monthly', label: '월급' },
];

const SUBJECTS = ['수학', '영어', '국어', '과학', '사회', '물리', '화학', '역사', '기타'];

function subjectLabel(s) {
  return SUBJECT_LABELS[s] || s;
}

function wageLabel(wageType) {
  return WAGE_TYPE_LABELS[wageType] || wageType;
}

function taskTypeLabel(t) {
  return TASK_TYPE_LABELS[t] || t;
}

// ─── 강사 상세 화면 ─────────────────────────────────────────────
function TeacherDetailPage({ teacher, onBack, onEdit, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const wageInfo = teacher.wageType === 'hourly' && teacher.hourlyWage
    ? `시급 ${teacher.hourlyWage.toLocaleString()}원`
    : teacher.wageType === 'monthly' && teacher.monthlyWage
    ? `월급 ${teacher.monthlyWage.toLocaleString()}원`
    : '급여 정보 없음';

  return (
    <div className="fixed inset-0 bg-[#F5F6F8] z-20 overflow-y-auto">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-[#F5F6F8] z-10 flex items-center justify-between px-4 py-4">
          <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </button>
          <p className="text-base font-bold text-gray-900">강사 상세</p>
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-sm font-semibold text-blue-600 px-3 py-1.5 rounded-xl active:bg-blue-50"
          >
            <Pencil size={14} />
            수정
          </button>
        </div>

        <div className="px-4 pb-8 flex flex-col gap-4 pt-2">
          {/* 프로필 카드 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-xl font-bold text-blue-600 flex-shrink-0">
                {teacher.name[0]}
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{teacher.name}</p>
                <p className="text-sm text-blue-600 font-medium">강사</p>
              </div>
            </div>
            {teacher.phone && (
              <div className="flex items-center justify-between py-2.5 border-t border-gray-50">
                <span className="text-sm text-gray-500">연락처</span>
                <span className="text-sm font-medium text-gray-800">{teacher.phone}</span>
              </div>
            )}
          </div>

          {/* 담당 정보 */}
          {(teacher.subjects?.length > 0) && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-bold text-gray-400 mb-3">담당 과목</p>
              <div className="flex flex-wrap gap-2">
                {teacher.subjects.map((s) => (
                  <span key={s} className="text-xs font-semibold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 급여 정보 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-bold text-gray-400 mb-3">급여 정보</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">급여 방식</span>
              <span className="text-sm font-medium text-gray-800">{wageLabel(teacher.wageType)}</span>
            </div>
            <div className="flex items-center justify-between mt-2.5">
              <span className="text-sm text-gray-500">금액</span>
              <span className="text-sm font-bold text-gray-900">{wageInfo}</span>
            </div>
          </div>

          {/* 메모 */}
          {teacher.memo && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-bold text-gray-400 mb-2">메모</p>
              <p className="text-sm text-gray-700">{teacher.memo}</p>
            </div>
          )}

          {/* 삭제 버튼 */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full mt-4 py-4 rounded-2xl bg-red-50 text-red-500 font-bold text-sm border border-red-100"
          >
            강사 삭제
          </button>
        </div>
      </div>

      {/* 삭제 확인 */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="강사 삭제"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">취소</button>
            <button onClick={onDelete} className="flex-1 py-3.5 rounded-xl bg-red-500 text-white text-sm font-bold">삭제</button>
          </div>
        }
      >
        <div className="bg-red-50 rounded-2xl px-4 py-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 mb-1">이 프로필을 삭제할까요?</p>
            <p className="text-xs text-red-500">삭제한 정보는 되돌릴 수 없어요.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── 보조강사 상세 화면 ─────────────────────────────────────────
function AssistantDetailPage({ assistant, onBack, onEdit, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const wageInfo = assistant.wageType === 'monthly' && assistant.monthlySalary
    ? `월급 ${assistant.monthlySalary.toLocaleString()}원`
    : assistant.wageType === 'hourly' && assistant.hourlyWage
    ? `시급 ${assistant.hourlyWage.toLocaleString()}원`
    : '급여 정보 없음';

  const translatedTasks = (assistant.taskTypes || []).map((t) => taskTypeLabel(t));

  return (
    <div className="fixed inset-0 bg-[#F5F6F8] z-20 overflow-y-auto">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-[#F5F6F8] z-10 flex items-center justify-between px-4 py-4">
          <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </button>
          <p className="text-base font-bold text-gray-900">보조강사 상세</p>
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-sm font-semibold text-purple-600 px-3 py-1.5 rounded-xl active:bg-purple-50"
          >
            <Pencil size={14} />
            수정
          </button>
        </div>

        <div className="px-4 pb-8 flex flex-col gap-4 pt-2">
          {/* 프로필 카드 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center text-xl font-bold text-purple-600 flex-shrink-0">
                {assistant.name[0]}
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{assistant.name}</p>
                <p className="text-sm text-purple-600 font-medium">보조강사</p>
              </div>
            </div>
            {assistant.phone && (
              <div className="flex items-center justify-between py-2.5 border-t border-gray-50">
                <span className="text-sm text-gray-500">연락처</span>
                <span className="text-sm font-medium text-gray-800">{assistant.phone}</span>
              </div>
            )}
          </div>

          {/* 담당 정보 */}
          {(assistant.subjects?.length > 0 || translatedTasks.length > 0) && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              {assistant.subjects?.length > 0 && (
                <>
                  <p className="text-xs font-bold text-gray-400 mb-2">담당 과목</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {assistant.subjects.map((s) => (
                      <span key={s} className="text-xs font-semibold bg-purple-50 text-purple-600 px-3 py-1.5 rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {translatedTasks.length > 0 && (
                <>
                  <p className="text-xs font-bold text-gray-400 mb-2">담당 업무</p>
                  <div className="flex flex-wrap gap-2">
                    {translatedTasks.map((t) => (
                      <span key={t} className="text-xs font-semibold bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full">
                        {t}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 급여 정보 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-bold text-gray-400 mb-3">급여 정보</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">급여 방식</span>
              <span className="text-sm font-medium text-gray-800">{wageLabel(assistant.wageType)}</span>
            </div>
            <div className="flex items-center justify-between mt-2.5">
              <span className="text-sm text-gray-500">금액</span>
              <span className="text-sm font-bold text-gray-900">{wageInfo}</span>
            </div>
          </div>

          {/* 메모 */}
          {assistant.memo && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-bold text-gray-400 mb-2">메모</p>
              <p className="text-sm text-gray-700">{assistant.memo}</p>
            </div>
          )}

          {/* 삭제 버튼 */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full mt-4 py-4 rounded-2xl bg-red-50 text-red-500 font-bold text-sm border border-red-100"
          >
            보조강사 삭제
          </button>
        </div>
      </div>

      {/* 삭제 확인 */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="보조강사 삭제"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">취소</button>
            <button onClick={onDelete} className="flex-1 py-3.5 rounded-xl bg-red-500 text-white text-sm font-bold">삭제</button>
          </div>
        }
      >
        <div className="bg-red-50 rounded-2xl px-4 py-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 mb-1">이 프로필을 삭제할까요?</p>
            <p className="text-xs text-red-500">삭제한 정보는 되돌릴 수 없어요.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────
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
  const [viewTeacher, setViewTeacher] = useState(null);
  const [showAssistantForm, setShowAssistantForm] = useState(false);
  const [editAssistant, setEditAssistant] = useState(null);
  const [viewAssistant, setViewAssistant] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const isOwner = role === 'owner';

  const handleDeleteTeacher = (id) => {
    deleteTeacher(id);
    setViewTeacher(null);
    showToast('강사 정보가 삭제되었어요.');
  };

  const handleDeleteAssistant = (id) => {
    deleteAssistant(id);
    setViewAssistant(null);
    showToast('보조강사 정보가 삭제되었어요.');
  };

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
              <button
                onClick={() => { setEditTeacher(null); setShowTeacherForm(true); }}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full"
              >
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
                  <button
                    key={teacher.id}
                    onClick={() => setViewTeacher(teacher)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 text-left active:bg-gray-50"
                  >
                    <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-sm font-bold text-blue-600 flex-shrink-0">
                      {teacher.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{teacher.name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {teacher.subjects?.join(', ')}
                        {teacher.subjects?.length > 0 && teacher.wageType ? ' · ' : ''}
                        {wageLabel(teacher.wageType)}
                        {teacher.wageType === 'hourly' && teacher.hourlyWage ? ` ${teacher.hourlyWage.toLocaleString()}원` : ''}
                        {teacher.wageType === 'monthly' && teacher.monthlyWage ? ` ${teacher.monthlyWage.toLocaleString()}원` : ''}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                  </button>
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
              <button
                onClick={() => { setEditAssistant(null); setShowAssistantForm(true); }}
                className="flex items-center gap-1 text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full"
              >
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
                  const translatedTasks = (assistant.taskTypes || []).map(taskTypeLabel);
                  const wageInfo = assistant.wageType === 'monthly'
                    ? `월급 ${(assistant.monthlySalary || 0).toLocaleString()}원`
                    : `시급 ${(assistant.hourlyWage || 0).toLocaleString()}원`;
                  return (
                    <button
                      key={assistant.id}
                      onClick={() => setViewAssistant(assistant)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 text-left active:bg-gray-50"
                    >
                      <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center text-sm font-bold text-purple-600 flex-shrink-0">
                        {assistant.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{assistant.name}</p>
                        {translatedTasks.length > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{translatedTasks.join(' · ')}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">{wageInfo}</p>
                      </div>
                      <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                    </button>
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
              <button
                onClick={() => generateAcademySampleData()}
                className="w-full flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3.5 text-left active:bg-blue-100"
              >
                <RotateCcw size={16} className="text-blue-500" />
                <div>
                  <p className="text-sm font-bold text-blue-600">샘플 데이터 생성</p>
                  <p className="text-xs text-blue-400 mt-0.5">테스트용 반/학생/클리닉 데이터를 만들어요</p>
                </div>
              </button>
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3.5 text-left active:bg-red-100"
              >
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
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white shadow-sm text-gray-600 text-sm font-medium"
          >
            <LogOut size={16} />
            역할 변경
          </button>
        </div>
      </div>

      {/* 강사 상세 화면 */}
      {viewTeacher && (
        <TeacherDetailPage
          teacher={viewTeacher}
          onBack={() => setViewTeacher(null)}
          onEdit={() => { setEditTeacher(viewTeacher); setViewTeacher(null); setShowTeacherForm(true); }}
          onDelete={() => handleDeleteTeacher(viewTeacher.id)}
        />
      )}

      {/* 보조강사 상세 화면 */}
      {viewAssistant && (
        <AssistantDetailPage
          assistant={viewAssistant}
          onBack={() => setViewAssistant(null)}
          onEdit={() => { setEditAssistant(viewAssistant); setViewAssistant(null); setShowAssistantForm(true); }}
          onDelete={() => handleDeleteAssistant(viewAssistant.id)}
        />
      )}

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
            if (editTeacher) { updateTeacher(editTeacher.id, data); showToast('강사 정보가 저장되었습니다.'); }
            else { addTeacher(data); showToast('강사가 추가되었습니다.'); }
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
            if (editAssistant) { updateAssistant(editAssistant.id, data); showToast('보조강사 정보가 저장되었습니다.'); }
            else { addAssistant(data); showToast('보조강사가 추가되었습니다.'); }
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
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">학원 이름</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="우리 학원" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">주소</label>
          <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="서울시 강남구..." className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">연락처</label>
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))} placeholder="02-0000-0000" className="input" />
        </div>
      </div>
    </Modal>
  );
}

function TeacherFormModal({ editTeacher, onClose, onSave }) {
  const [form, setForm] = useState({
    name: editTeacher?.name || '',
    phone: editTeacher?.phone || '',
    subjects: editTeacher?.subjects || [],
    wageType: editTeacher?.wageType || 'hourly',
    hourlyWage: editTeacher?.hourlyWage ? String(editTeacher.hourlyWage) : '',
    monthlyWage: editTeacher?.monthlyWage ? String(editTeacher.monthlyWage) : '',
    memo: editTeacher?.memo || '',
    status: 'active',
  });
  const toggleSubject = (s) => setForm((f) => ({
    ...f,
    subjects: f.subjects.includes(s) ? f.subjects.filter((x) => x !== s) : [...f.subjects, s],
  }));

  return (
    <Modal isOpen onClose={onClose} title={editTeacher ? '강사 수정' : '강사 추가'}
      footer={
        <button
          onClick={() => {
            if (!form.name.trim()) return alert('이름을 입력해주세요.');
            onSave({ ...form, hourlyWage: Number(form.hourlyWage), monthlyWage: Number(form.monthlyWage) });
          }}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl"
        >
          저장
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">이름 *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="홍강사" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">연락처</label>
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))} placeholder="010-0000-0000" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">담당 과목</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button key={s} type="button" onClick={() => toggleSubject(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${form.subjects.includes(s) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">급여 방식</label>
          <div className="grid grid-cols-2 gap-2">
            {WAGE_TYPES.map((w) => (
              <button key={w.id} type="button" onClick={() => setForm((f) => ({ ...f, wageType: w.id }))}
                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${form.wageType === w.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                {w.label}
              </button>
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
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
          <textarea value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} rows={2} placeholder="특이사항 등" className="input resize-none" />
        </div>
      </div>
    </Modal>
  );
}

const TASK_TYPES = [
  { key: 'homework', label: '숙제 검사' },
  { key: 'wrong_answer', label: '오답 풀이' },
  { key: 'vocabulary', label: '단어 테스트' },
  { key: 'reading', label: '본문 암기' },
  { key: 'grammar', label: '문법 보충' },
  { key: 'concept', label: '개념 보충' },
  { key: 'test_retry', label: '재시험' },
  { key: 'other', label: '기타' },
];

function AssistantFormModal({ editAssistant, onClose, onSave }) {
  const [form, setForm] = useState({
    name: editAssistant?.name || '',
    phone: editAssistant?.phone || '',
    subjects: editAssistant?.subjects || [],
    taskTypes: editAssistant?.taskTypes || [],
    wageType: editAssistant?.wageType || 'hourly',
    hourlyWage: editAssistant?.hourlyWage ? String(editAssistant.hourlyWage) : '',
    monthlySalary: editAssistant?.monthlySalary ? String(editAssistant.monthlySalary) : '',
    memo: editAssistant?.memo || '',
    status: 'active',
  });

  const toggleSubject = (s) => setForm((f) => ({
    ...f,
    subjects: f.subjects.includes(s) ? f.subjects.filter((x) => x !== s) : [...f.subjects, s],
  }));
  const toggleTaskType = (key) => setForm((f) => ({
    ...f,
    taskTypes: f.taskTypes.includes(key) ? f.taskTypes.filter((x) => x !== key) : [...f.taskTypes, key],
  }));

  return (
    <Modal isOpen onClose={onClose} title={editAssistant ? '보조강사 수정' : '보조강사 추가'}
      footer={
        <button
          onClick={() => {
            if (!form.name.trim()) return alert('이름을 입력해주세요.');
            onSave({ ...form, hourlyWage: Number(form.hourlyWage) || 0, monthlySalary: Number(form.monthlySalary) || 0 });
          }}
          className="w-full bg-purple-600 text-white font-bold py-3.5 rounded-xl"
        >
          저장
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">이름 *</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="홍보조" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">연락처</label>
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))} placeholder="010-0000-0000" className="input" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">담당 과목</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button key={s} type="button" onClick={() => toggleSubject(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${form.subjects.includes(s) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">담당 업무</label>
          <div className="flex flex-wrap gap-2">
            {TASK_TYPES.map(({ key, label }) => (
              <button key={key} type="button" onClick={() => toggleTaskType(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${form.taskTypes.includes(key) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">급여 방식</label>
          <div className="grid grid-cols-2 gap-2">
            {WAGE_TYPES.map((w) => (
              <button key={w.id} type="button" onClick={() => setForm((f) => ({ ...f, wageType: w.id }))}
                className={`py-2.5 rounded-xl text-sm font-bold border-2 ${form.wageType === w.id ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                {w.label}
              </button>
            ))}
          </div>
          {form.wageType === 'hourly' && (
            <input type="number" value={form.hourlyWage} onChange={(e) => setForm((f) => ({ ...f, hourlyWage: e.target.value }))} placeholder="시급 (원)" className="input mt-2" />
          )}
          {form.wageType === 'monthly' && (
            <input type="number" value={form.monthlySalary} onChange={(e) => setForm((f) => ({ ...f, monthlySalary: e.target.value }))} placeholder="월급 (원)" className="input mt-2" />
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">메모</label>
          <textarea value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} rows={2} placeholder="특이사항 등" className="input resize-none" />
        </div>
      </div>
    </Modal>
  );
}
