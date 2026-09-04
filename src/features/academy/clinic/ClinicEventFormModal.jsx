import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, Trash2, X } from 'lucide-react';
import useAcademyStore from '../../../store/useAcademyStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  deleteAcademyClinicEvent,
  saveAcademyClinicEvent,
} from '../../../services/supabase/domainApi';
import { ACADEMY_SUBJECT_OPTIONS } from '../../../constants/academySettings';
import { today } from '../../../utils/date';

function participantIdsOf(event) {
  return new Set(
    (event?.clinic_event_students || [])
      .map((participant) => participant.student_id)
      .filter(Boolean),
  );
}

export default function ClinicEventFormModal({ event = null, initialDate = null, onClose }) {
  const academyStudents = useAcademyStore((state) => state.academyStudents) ?? [];
  const classGroups = useAcademyStore((state) => state.classGroups) ?? [];
  const showToast = useAcademyStore((state) => state.showToast);
  const currentAcademyId = useWorkspaceStore((state) => state.currentAcademyId);
  const loadServerClinicEvents = useWorkspaceStore((state) => state.loadServerClinicEvents);

  const [name, setName] = useState(event?.name || '');
  const [nameTouched, setNameTouched] = useState(!!event?.name);
  const [date, setDate] = useState(event?.event_date || initialDate || today());
  const [startTime, setStartTime] = useState(event?.start_time?.slice(0, 5) || '');
  const [endTime, setEndTime] = useState(event?.end_time?.slice(0, 5) || '');
  const [subject, setSubject] = useState(event?.subject || '');
  const [room, setRoom] = useState(event?.room || '');
  const [memo, setMemo] = useState(event?.memo || '');
  const [classGroupId, setClassGroupId] = useState(event?.class_group_id || '');
  const [selectedStudentIds, setSelectedStudentIds] = useState(() => participantIdsOf(event));
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selectedGroup = classGroups.find((group) => group.id === classGroupId) || null;
  const activeStudents = useMemo(() => academyStudents
    .filter((student) => (student.status || 'active') !== 'inactive')
    .slice()
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ko')),
  [academyStudents]);
  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeStudents;
    return activeStudents.filter((student) => (
      String(student.name || '').toLowerCase().includes(query)
      || String(student.school || '').toLowerCase().includes(query)
      || String(student.grade || '').toLowerCase().includes(query)
    ));
  }, [activeStudents, search]);

  useEffect(() => {
    if (nameTouched) return;
    const base = selectedGroup?.name || subject || '클리닉';
    setName(base.includes('클리닉') ? base : `${base} 클리닉`);
  }, [nameTouched, selectedGroup?.name, subject]);

  const selectGroup = (nextGroupId) => {
    setClassGroupId(nextGroupId);
    const group = classGroups.find((item) => item.id === nextGroupId);
    if (!group) return;
    if (group.subject) setSubject(group.subject);
    setSelectedStudentIds((current) => {
      const next = new Set(current);
      (group.studentIds || []).forEach((studentId) => next.add(studentId));
      return next;
    });
  };

  const toggleStudent = (studentId) => {
    setSelectedStudentIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const save = async () => {
    if (saving) return;
    if (!name.trim()) {
      showToast('클리닉 이름을 입력해주세요.', 'error');
      return;
    }
    if (selectedStudentIds.size === 0) {
      showToast('학생을 한 명 이상 선택해주세요.', 'error');
      return;
    }
    if (startTime && endTime && endTime <= startTime) {
      showToast('종료 시간은 시작 시간보다 늦어야 해요.', 'error');
      return;
    }
    const participants = [...selectedStudentIds].map((studentId) => {
      const student = academyStudents.find((item) => item.id === studentId);
      return { studentId: student?.serverId || studentId };
    });
    setSaving(true);
    try {
      await saveAcademyClinicEvent({
        id: event?.id || null,
        academyId: currentAcademyId,
        name: name.trim(),
        date,
        startTime: startTime || null,
        endTime: endTime || null,
        subject: subject || null,
        room: room.trim() || null,
        classGroupId: selectedGroup?.serverId || selectedGroup?.id || null,
        memo: memo.trim() || null,
        participants,
      });
      await loadServerClinicEvents();
      showToast(event ? '클리닉 일정을 수정했어요.' : '클리닉 일정을 만들었어요.');
      onClose();
    } catch (error) {
      console.error('[clinic] clinic event save failed', error);
      showToast(error?.message || '클리닉 일정을 저장하지 못했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!event?.id || saving) return;
    setSaving(true);
    try {
      await deleteAcademyClinicEvent(event.id);
      await loadServerClinicEvents();
      showToast('클리닉 일정을 삭제했어요. 기존 학생 기록은 보관돼요.');
      onClose();
    } catch (error) {
      console.error('[clinic] clinic event delete failed', error);
      showToast(error?.message || '클리닉 일정을 삭제하지 못했어요.', 'error');
    } finally {
      setSaving(false);
      setConfirmDelete(false);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35 md:items-center md:justify-center md:p-6">
      <div className="relative flex h-full w-full flex-col bg-[#F7F8FA] md:h-[min(880px,94vh)] md:max-w-3xl md:rounded-[28px] md:shadow-2xl">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[#E5E8EB] bg-white px-5 md:rounded-t-[28px]">
          <div>
            <h2 className="text-lg font-extrabold text-[#191F28]">{event ? '클리닉 일정 수정' : '클리닉 일정 만들기'}</h2>
            <p className="mt-0.5 text-[11px] font-medium text-[#8B95A1]">학생마다 한 행에서 여러 활동을 기록해요.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F4F6] text-[#6B7684]">
            <X size={19} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          <section className="rounded-3xl bg-white p-4 shadow-sm md:p-5">
            <label className="block">
              <span className="mb-2 block text-xs font-bold text-[#4E5968]">이름</span>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
                placeholder="예: 영어 단어 클리닉"
                className="h-12 w-full rounded-2xl border border-[#D1D6DB] px-4 text-sm font-bold text-[#191F28] outline-none focus:border-[#3182F6]"
              />
            </label>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label>
                <span className="mb-2 block text-xs font-bold text-[#4E5968]">날짜</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-[#D1D6DB] px-3 text-sm font-semibold outline-none focus:border-[#3182F6]" />
              </label>
              <label>
                <span className="mb-2 block text-xs font-bold text-[#4E5968]">시작</span>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-11 w-full rounded-xl border border-[#D1D6DB] px-3 text-sm font-semibold outline-none focus:border-[#3182F6]" />
              </label>
              <label>
                <span className="mb-2 block text-xs font-bold text-[#4E5968]">종료</span>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-11 w-full rounded-xl border border-[#D1D6DB] px-3 text-sm font-semibold outline-none focus:border-[#3182F6]" />
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label>
                <span className="mb-2 block text-xs font-bold text-[#4E5968]">학생 불러오기</span>
                <select value={classGroupId} onChange={(e) => selectGroup(e.target.value)} className="h-11 w-full rounded-xl border border-[#D1D6DB] bg-white px-3 text-sm font-semibold outline-none focus:border-[#3182F6]">
                  <option value="">반 선택 안 함</option>
                  {classGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-xs font-bold text-[#4E5968]">기본 과목</span>
                <select value={subject} onChange={(e) => setSubject(e.target.value)} className="h-11 w-full rounded-xl border border-[#D1D6DB] bg-white px-3 text-sm font-semibold outline-none focus:border-[#3182F6]">
                  <option value="">과목 없음</option>
                  {ACADEMY_SUBJECT_OPTIONS.map((option) => <option key={option.id} value={option.label}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-xs font-bold text-[#4E5968]">장소</span>
                <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="선택사항" className="h-11 w-full rounded-xl border border-[#D1D6DB] px-3 text-sm font-semibold outline-none focus:border-[#3182F6]" />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-bold text-[#4E5968]">메모</span>
              <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="선택사항" className="h-11 w-full rounded-xl border border-[#D1D6DB] px-3 text-sm font-semibold outline-none focus:border-[#3182F6]" />
            </label>
          </section>

          <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-[#191F28]">학생</h3>
                <p className="mt-1 text-[11px] font-medium text-[#8B95A1]">반 학생을 불러온 뒤 자유롭게 추가하거나 뺄 수 있어요.</p>
              </div>
              <span className="text-xs font-extrabold text-[#3182F6]">{selectedStudentIds.size}명</span>
            </div>
            <div className="mt-3 flex h-11 items-center gap-2 rounded-xl border border-[#E5E8EB] px-3">
              <Search size={15} className="text-[#8B95A1]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="이름·학교·학년 검색" className="min-w-0 flex-1 text-sm font-semibold outline-none placeholder:text-[#B0B8C1]" />
            </div>
            <div className="mt-3 max-h-80 divide-y divide-[#F2F4F6] overflow-y-auto">
              {visibleStudents.map((student) => {
                const selected = selectedStudentIds.has(student.id);
                return (
                  <button key={student.id} type="button" onClick={() => toggleStudent(student.id)} className="flex w-full items-center gap-3 py-3 text-left">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${selected ? 'border-[#3182F6] bg-[#3182F6] text-white' : 'border-[#D1D6DB] text-transparent'}`}><Check size={14} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#333D4B]">{student.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-[#8B95A1]">{[student.school, student.grade].filter(Boolean).join(' · ') || '학교·학년 미입력'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="flex flex-shrink-0 gap-2 border-t border-[#E5E8EB] bg-white p-4 md:rounded-b-[28px]">
          {event && (
            <button type="button" onClick={() => setConfirmDelete(true)} disabled={saving} className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-500 disabled:opacity-50" aria-label="클리닉 일정 삭제">
              <Trash2 size={18} />
            </button>
          )}
          <button type="button" onClick={save} disabled={saving} className="h-12 w-full rounded-2xl bg-[#3182F6] text-sm font-extrabold text-white disabled:bg-[#B0B8C1]">
            {saving ? '저장 중...' : event ? '수정하기' : '일정 만들기'}
          </button>
        </footer>
        {confirmDelete && (
          <div className="absolute inset-0 z-10 flex items-end bg-black/35 md:items-center md:justify-center md:rounded-[28px]">
            <div className="w-full rounded-t-3xl bg-white p-5 md:max-w-sm md:rounded-3xl">
              <p className="text-base font-extrabold text-[#191F28]">이 일정을 삭제할까요?</p>
              <p className="mt-2 text-sm leading-6 text-[#6B7684]">학생별로 이미 저장한 기록은 삭제되지 않고 기록 목록에 남아요.</p>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)} className="h-12 flex-1 rounded-2xl bg-[#F2F4F6] text-sm font-bold text-[#4E5968]">취소</button>
                <button type="button" onClick={remove} className="h-12 flex-1 rounded-2xl bg-red-500 text-sm font-bold text-white">삭제</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
