import { useMemo, useState } from 'react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { createAcademyClassSession } from '../../../services/supabase/domainApi';
import { today, formatDateShort } from '../../../utils/date';
import { normalizeRecordSchema } from '../../../constants/learningActivitySettings';
import { mapClassSessionToServerPayload } from './ClassGroupFormModal';

export default function MakeupSessionModal({
  group,
  students,
  sessions,
  onClose,
}) {
  const addClassSession = useAcademyStore((state) => state.addClassSession);
  const setClassSessionServerId = useAcademyStore((state) => state.setClassSessionServerId);
  const showToast = useAcademyStore((state) => state.showToast);
  const attendanceRecords = useAcademyStore((state) => state.academyAttendanceRecords) ?? [];
  const academyStudents = useAcademyStore((state) => state.academyStudents) ?? [];
  const academyTeachers = useAcademyStore((state) => state.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((state) => state.academyAssistants) ?? [];
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authUserId = useAuthStore((state) => state.user?.id);
  const currentAcademyId = useWorkspaceStore((state) => state.currentAcademyId);
  const loadServerClassSessions = useWorkspaceStore((state) => state.loadServerClassSessions);

  const originOptions = useMemo(
    () => [...(sessions || [])]
      .filter((session) => !session.isPlanned && session.status !== 'canceled')
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.startTime || '').localeCompare(a.startTime || ''))
      .slice(0, 30),
    [sessions],
  );
  const [form, setForm] = useState({
    originSessionId: '',
    studentIds: [],
    date: today(),
    startTime: group.startTime || '16:00',
    endTime: group.endTime || '18:00',
    room: group.room || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const toggleStudent = (studentId) => setForm((current) => ({
    ...current,
    studentIds: current.studentIds.includes(studentId)
      ? current.studentIds.filter((id) => id !== studentId)
      : [...current.studentIds, studentId],
  }));

  const selectOrigin = (originSessionId) => {
    const absentIds = attendanceRecords
      .filter((record) => (
        record.sessionId === originSessionId
        && ['absent', 'makeup'].includes(record.status)
      ))
      .map((record) => record.studentId)
      .filter((studentId) => students.some((student) => student.id === studentId));
    setForm((current) => ({
      ...current,
      originSessionId,
      studentIds: absentIds.length > 0 ? absentIds : current.studentIds,
    }));
  };

  const handleSave = async () => {
    if (saving) return;
    if (form.studentIds.length === 0) {
      showToast('보강할 학생을 선택해주세요.', 'error');
      return;
    }
    if (!form.date || !form.startTime || !form.endTime) {
      showToast('보강 날짜와 시간을 입력해주세요.', 'error');
      return;
    }
    if (form.endTime <= form.startTime) {
      showToast('끝나는 시간은 시작 시간보다 뒤여야 해요.', 'error');
      return;
    }
    const origin = originOptions.find((session) => session.id === form.originSessionId) || null;
    const localPayload = {
      classGroupId: group.id,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      room: form.room.trim(),
      teacherId: group.teacherId || '',
      teacherUserId: group.teacherUserId || '',
      assistantIds: [],
      studentIds: form.studentIds,
      status: 'scheduled',
      memo: origin ? `${origin.date} 수업 보강` : '보강',
      recordSchema: normalizeRecordSchema(group.recordSchema || group.recordBlocks),
      activityType: 'makeup',
      activityName: '보강',
      sessionKind: 'makeup',
      originSessionId: origin?.id || null,
      originSessionServerId: origin?.serverId || null,
    };

    setSaving(true);
    try {
      const localSession = addClassSession(localPayload);
      if (isAuthenticated && currentAcademyId && group.serverId) {
        try {
          const created = await createAcademyClassSession({
            academyId: currentAcademyId,
            ...mapClassSessionToServerPayload(
              localPayload,
              group.serverId,
              academyStudents,
              academyAssistants,
              academyTeachers,
              authUserId,
            ),
          });
          if (created?.id) setClassSessionServerId(localSession.id, created.id);
          await loadServerClassSessions();
        } catch (error) {
          showToast(
            error?.message
              ? `보강은 만들었지만 서버 동기화에 실패했어요: ${error.message}`
              : '보강은 만들었지만 서버 동기화에 실패했어요.',
            'error',
          );
        }
      }
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="보강 만들기"
      size="wide"
      footer={(
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-[#3182F6] py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {saving ? '만드는 중...' : '보강 만들기'}
        </button>
      )}
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-1.5 text-xs font-bold text-[#6B7684]">연결할 원래 수업</p>
          <select
            value={form.originSessionId}
            onChange={(event) => selectOrigin(event.target.value)}
            className="input"
          >
            <option value="">연결하지 않고 만들기</option>
            {originOptions.map((session) => (
              <option key={session.id} value={session.id}>
                {formatDateShort(session.date)} {session.startTime} {session.sessionKind === 'makeup' ? '· 보강' : ''}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-[#8B95A1]">결석 학생이 기록돼 있으면 자동으로 선택해요.</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold text-[#6B7684]">보강 학생</p>
          <div className="flex flex-wrap gap-2">
            {students.map((student) => {
              const selected = form.studentIds.includes(student.id);
              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => toggleStudent(student.id)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                    selected
                      ? 'border-[#3182F6] bg-[#E8F3FF] text-[#1B64DA]'
                      : 'border-[#E5E8EB] bg-white text-[#4E5968]'
                  }`}
                >
                  {selected && '✓ '}{student.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-bold text-[#6B7684]">날짜</p>
            <input type="date" value={form.date} onChange={(event) => set('date', event.target.value)} className="input" />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold text-[#6B7684]">강의실</p>
            <input value={form.room} onChange={(event) => set('room', event.target.value)} placeholder="강의실" className="input" />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <input type="time" value={form.startTime} onChange={(event) => set('startTime', event.target.value)} className="input" />
          <span className="text-sm text-[#8B95A1]">~</span>
          <input type="time" value={form.endTime} onChange={(event) => set('endTime', event.target.value)} className="input" />
        </div>
      </div>
    </Modal>
  );
}
