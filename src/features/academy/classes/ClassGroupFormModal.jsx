import { useState } from 'react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyClassGroup,
  updateClassGroup as updateServerClassGroup,
  createAcademyClassSessionsBulk,
} from '../../../services/supabase/domainApi';
import { OWNER_TEACHER_ID } from '../../../utils/format';
import BulkShiftSuggestionSheet from '../work/BulkShiftSuggestionSheet';

function emptyToNull(v) {
  if (v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
}

// 로컬 반 폼 → Supabase class_groups snake_case payload.
// student_ids / student_billings 는 academyStudents 에서 serverId 가 있는 학생만
// 서버 uuid 로 매핑. serverId 없는 학생은 서버 row 에서 제외 (로컬은 그대로 유지).
// Phase 35 — assistantIds (로컬 ID) → assistant_ids (server user_id) 로 변환.
//   serverUserId 가 비어 있는 보조강사는 제외 (서버에 매핑할 수 없으므로).
// id / academy_id / user_id / mode 는 createAcademyClassGroup 에서 자동 주입.
function mapClassGroupFormToServerPayload(form, academyStudents, academyAssistants = []) {
  const studentById = new Map(academyStudents.map((s) => [s.id, s]));

  const serverStudentIds = (form.studentIds || [])
    .map((localId) => studentById.get(localId)?.serverId)
    .filter(Boolean);

  const serverStudentBillings = {};
  for (const [localId, fee] of Object.entries(form.studentBillings || {})) {
    const stu = studentById.get(localId);
    if (stu?.serverId) {
      serverStudentBillings[stu.serverId] = Number(fee) || 0;
    }
  }

  const assistantById = new Map(academyAssistants.map((a) => [a.id, a]));
  const serverAssistantIds = (form.assistantIds || [])
    .map((localId) => assistantById.get(localId)?.serverUserId)
    .filter(Boolean);

  const monthlyFee = Number(form.monthlyFee) || 0;
  const defaultBilling = monthlyFee > 0 ? { monthlyFee } : {};

  return {
    name: form.name?.trim() ?? '',
    subject: emptyToNull(form.subject),
    level: emptyToNull(form.level),
    teacher_id: emptyToNull(form.teacherId),
    teacher_type: form.teacherId === OWNER_TEACHER_ID ? 'owner' : 'teacher',
    student_ids: serverStudentIds,
    assistant_ids: serverAssistantIds,
    weekdays: Array.isArray(form.weekdays) ? form.weekdays : [],
    start_time: emptyToNull(form.startTime),
    end_time: emptyToNull(form.endTime),
    room: emptyToNull(form.room),
    start_date: emptyToNull(form.startDate),
    end_date: emptyToNull(form.endDate),
    billing_mode: form.billingMode || 'same',
    default_billing: defaultBilling,
    student_billings: serverStudentBillings,
    memo: emptyToNull(form.memo),
    status: form.status || 'active',
  };
}

// local classSession → Supabase class_sessions snake_case payload.
// class_group_id 는 호출처에서 (serverGroupId) 로 명시적으로 전달.
// student_ids 는 학생 serverId 가 있는 항목만 포함.
// Phase 35 — assistant_ids (server user_id 배열) 도 함께 보냄.
function mapClassSessionToServerPayload(localSession, classGroupServerId, academyStudents, academyAssistants = []) {
  const studentById = new Map(academyStudents.map((s) => [s.id, s]));
  const serverStudentIds = (localSession.studentIds || [])
    .map((localId) => studentById.get(localId)?.serverId)
    .filter(Boolean);
  const assistantById = new Map(academyAssistants.map((a) => [a.id, a]));
  const serverAssistantIds = (localSession.assistantIds || [])
    .map((localId) => assistantById.get(localId)?.serverUserId)
    .filter(Boolean);
  const teacherId = localSession.teacherId || null;
  return {
    class_group_id: classGroupServerId,
    date: localSession.date,
    start_time: emptyToNull(localSession.startTime),
    end_time: emptyToNull(localSession.endTime),
    room: emptyToNull(localSession.room),
    teacher_id: teacherId,
    teacher_type: teacherId === OWNER_TEACHER_ID ? 'owner' : 'teacher',
    student_ids: serverStudentIds,
    assistant_ids: serverAssistantIds,
    status: localSession.status || 'scheduled',
    memo: emptyToNull(localSession.memo),
  };
}

// bulk insert 결과를 local sessions 와 매칭. (date, start_time) 조합이
// 같은 class_group 안에서 unique 하므로 이를 key 로 사용.
function matchSessionPairs(localSessions, serverSessions) {
  const serverByKey = new Map(
    serverSessions.map((srv) => [`${srv.date}__${srv.start_time ?? ''}`, srv])
  );
  return localSessions
    .map((local) => {
      const key = `${local.date}__${local.startTime ?? ''}`;
      const srv = serverByKey.get(key);
      return srv ? { localId: local.id, serverId: srv.id } : null;
    })
    .filter(Boolean);
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const SUBJECTS = ['수학', '영어', '국어', '과학', '사회', '물리', '화학', '역사', '기타'];
const LEVELS = ['초등', '초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', '수능'];

export default function ClassGroupFormModal({ editGroup, onClose }) {
  const {
    addClassGroup, updateClassGroup, setClassGroupServerId, setClassSessionServerIds,
    academyStudents, academyTeachers, academyAssistants = [], academyProfile, showToast,
  } = useAcademyStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerClassGroups = useWorkspaceStore((s) => s.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const [submitting, setSubmitting] = useState(false);
  // Phase 35 — 반 생성/수정 후 근무표 자동 추가 제안 sheet.
  const [shiftSuggestion, setShiftSuggestion] = useState(null);
  const ownerLabel = academyProfile?.ownerName?.trim() || '원장';

  // Phase 34 — 보조강사 배정 (옵션). UI 는 단일 선택, 내부 저장은 assistantIds 배열.
  const initialAssistantId = Array.isArray(editGroup?.assistantIds)
    ? editGroup.assistantIds[0] || ''
    : editGroup?.assistantId || '';
  const [form, setForm] = useState({
    name: editGroup?.name || '',
    subject: editGroup?.subject || '',
    level: editGroup?.level || '',
    teacherId: editGroup?.teacherId || '',
    assistantId: initialAssistantId,
    studentIds: editGroup?.studentIds || [],
    weekdays: editGroup?.weekdays || [],
    startTime: editGroup?.startTime || '16:00',
    endTime: editGroup?.endTime || '18:00',
    room: editGroup?.room || '',
    startDate: editGroup?.startDate || new Date().toISOString().slice(0, 10),
    endDate: editGroup?.endDate || '',
    billingMode: editGroup?.billingMode || 'same',
    monthlyFee: editGroup?.monthlyFee ? String(editGroup.monthlyFee) : '',
    studentBillings: editGroup?.studentBillings || {},
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
    setForm((f) => {
      const already = f.studentIds.includes(id);
      const studentIds = already ? f.studentIds.filter((s) => s !== id) : [...f.studentIds, id];
      const studentBillings = { ...f.studentBillings };
      if (already) delete studentBillings[id];
      return { ...f, studentIds, studentBillings };
    });

  const setStudentBilling = (id, value) =>
    setForm((f) => ({
      ...f,
      studentBillings: { ...f.studentBillings, [id]: value },
    }));

  const handleSave = async () => {
    if (submitting) return;
    if (!form.name.trim()) return alert('반 이름을 입력해주세요.');
    if (form.weekdays.length === 0) return alert('수업 요일을 선택해주세요.');
    if (!form.startDate) return alert('시작일을 선택해주세요.');

    const data = {
      ...form,
      // assistantId(단일 UI) → assistantIds 배열로 저장. 기존 데이터와 호환.
      assistantIds: form.assistantId ? [form.assistantId] : [],
      monthlyFee: Number(form.monthlyFee) || 0,
      studentBillings: Object.fromEntries(
        Object.entries(form.studentBillings).map(([k, v]) => [k, Number(v) || 0])
      ),
    };

    setSubmitting(true);
    try {
      if (editGroup) {
        // ── 수정 ──────────────────────────────────────────────
        // 1) localStorage 수정 (source of truth)
        updateClassGroup(editGroup.id, data);

        // 2) Supabase write-through — serverId 가 있을 때만 시도
        if (editGroup.serverId && isAuthenticated && currentAcademyId) {
          try {
            await updateServerClassGroup(
              editGroup.serverId,
              mapClassGroupFormToServerPayload(data, academyStudents, academyAssistants),
            );
            await loadServerClassGroups();
          } catch (err) {
            console.error('[supabase] updateClassGroup failed', err);
            showToast(
              err?.message
                ? `서버 동기화 실패: ${err.message}`
                : '반 정보는 수정되었지만 서버 동기화는 실패했어요.',
              'error',
            );
          }
        }
      } else {
        // ── 생성 ──────────────────────────────────────────────
        // 1) localStorage: classGroup 생성 + classSessions 자동 생성. 둘 다 확보.
        const result = addClassGroup(data);
        const localGroup = result.group;
        const localSessions = result.sessions ?? [];

        // Phase 35 — 다음 7일 안에 있는 세션에 대해 강사/보조강사 근무표 제안.
        // (전체 세션은 너무 많아서 부담. 가까운 1주만 미리 셋업하면 충분.)
        const todayStr = new Date().toISOString().slice(0, 10);
        const oneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toISOString().slice(0, 10);
        const upcoming = localSessions.filter((s) => s.date >= todayStr && s.date <= oneWeekLater);
        const lessonsByStaff = new Map();
        const teacher = data.teacherId && data.teacherId !== OWNER_TEACHER_ID
          ? academyTeachers.find((t) => t.id === data.teacherId)
          : null;
        if (teacher) {
          lessonsByStaff.set(`teacher_${teacher.id}`, {
            staff: teacher,
            staffRole: 'teacher',
            sessions: upcoming.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime })),
          });
        }
        const assistantId = data.assistantIds?.[0];
        const assistant = assistantId
          ? academyAssistants.find((a) => a.id === assistantId)
          : null;
        if (assistant) {
          lessonsByStaff.set(`assistant_${assistant.id}`, {
            staff: assistant,
            staffRole: 'assistant',
            sessions: upcoming.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime })),
          });
        }

        // 2) Supabase write-through — class_groups 먼저, 성공 시 class_sessions bulk
        if (isAuthenticated && currentAcademyId) {
          let serverGroup = null;
          try {
            serverGroup = await createAcademyClassGroup({
              academyId: currentAcademyId,
              ...mapClassGroupFormToServerPayload(data, academyStudents, academyAssistants),
            });
            if (serverGroup?.id && localGroup?.id) {
              setClassGroupServerId(localGroup.id, serverGroup.id);
            }
            await loadServerClassGroups();
          } catch (err) {
            console.error('[supabase] createAcademyClassGroup failed', err);
            showToast(
              err?.message
                ? `서버 저장 실패: ${err.message}`
                : '반은 생성되었지만 서버 저장은 실패했어요.',
              'error',
            );
          }

          // class_group 서버 저장 성공 시 sessions bulk insert 시도
          if (serverGroup?.id && localSessions.length > 0) {
            try {
              const sessionPayloads = localSessions.map((ls) =>
                mapClassSessionToServerPayload(ls, serverGroup.id, academyStudents, academyAssistants)
              );
              const serverSessions = await createAcademyClassSessionsBulk({
                academyId: currentAcademyId,
                sessions: sessionPayloads,
              });
              // local ↔ server 매칭 (date + start_time 기준)
              const pairs = matchSessionPairs(localSessions, serverSessions);
              setClassSessionServerIds(pairs);
              await loadServerClassSessions();
              showToast(
                `반이 생성되고 서버에도 저장되었어요 · 수업 회차 ${serverSessions.length}개`,
              );
            } catch (err) {
              console.error('[supabase] createAcademyClassSessionsBulk failed', err);
              showToast(
                err?.message
                  ? `수업 회차 서버 저장 실패: ${err.message}`
                  : '반은 서버에 저장되었지만 수업 회차 서버 저장은 실패했어요.',
                'error',
              );
            }
          } else if (serverGroup?.id && localSessions.length === 0) {
            // 회차 없는 경우 (요일 미지정 등) — class_group 성공 안내만
            showToast('반이 생성되고 서버에도 저장되었어요.');
          }
        }

        // Phase 35 — 생성된 회차에 대해 근무표 제안. 영향 받는 강사가 1명 이상이면
        // 폼 모달을 닫지 않고 BulkShiftSuggestionSheet 를 보여준 뒤, sheet 닫힐 때 모달도 닫는다.
        const anyAffected = [...lessonsByStaff.values()].some((v) => v.sessions.length > 0);
        if (anyAffected) {
          setSubmitting(false);
          setShiftSuggestion(lessonsByStaff);
          return; // onClose 는 sheet 가 닫힐 때 호출.
        }
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const selectedStudents = academyStudents.filter((s) => form.studentIds.includes(s.id));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editGroup ? '반 정보 수정' : '반 만들기'}
      footer={
        <button
          onClick={handleSave}
          disabled={submitting}
          className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl disabled:opacity-60"
        >
          {submitting ? '저장 중…' : editGroup ? '저장' : '반 생성'}
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

        <Field label="담당 강사">
          <select value={form.teacherId} onChange={(e) => set('teacherId', e.target.value)} className="input">
            <option value="">강사 선택</option>
            <option value={OWNER_TEACHER_ID}>{ownerLabel} (원장 본인)</option>
            {academyTeachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>

        {/* Phase 34 — 보조강사 배정 (옵션). 비워둬도 정상. */}
        <Field label="보조강사 배정 (선택)">
          <select value={form.assistantId} onChange={(e) => set('assistantId', e.target.value)} className="input">
            <option value="">필요한 경우에만 선택하세요</option>
            {academyAssistants.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <p className="text-[11px] text-gray-400 mt-1.5">보조강사 주업무는 클리닉이라 수업 배정은 선택이에요.</p>
        </Field>

        {academyStudents.length > 0 && (
          <Field label={`학생 배정 (${form.studentIds.length}/${academyStudents.length})`}>
            {/* 중첩 스크롤 컨테이너 제거 — Modal 본문 스크롤 흐름을 이어받음 */}
            <div className="flex flex-col gap-2">
              {academyStudents.map((s) => (
                <button key={s.id} type="button" onClick={() => toggleStudent(s.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                    form.studentIds.includes(s.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                  }`}>
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.studentIds.includes(s.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`} />
                  <span className="text-sm font-medium text-gray-800 flex-1">{(s.name || '?')}</span>
                  {s.grade && <span className="text-xs text-gray-400">{s.grade}</span>}
                </button>
              ))}
            </div>
          </Field>
        )}

        {/* 수강료 설정 */}
        <Field label="수강료 설정">
          <div className="flex gap-2 mb-3">
            {[
              { value: 'same', label: '동일 수강료' },
              { value: 'perStudent', label: '학생별 수강료' },
            ].map(({ value, label }) => (
              <button key={value} type="button" onClick={() => set('billingMode', value)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                  form.billingMode === value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-500'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {form.billingMode === 'same' ? (
            <input
              type="number"
              value={form.monthlyFee}
              onChange={(e) => set('monthlyFee', e.target.value)}
              placeholder="월 수강료 (원)"
              className="input"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {selectedStudents.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">위에서 학생을 먼저 배정해주세요</p>
              ) : (
                selectedStudents.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                    <span className="text-sm font-medium text-gray-800 flex-1">{s.name}</span>
                    <input
                      type="number"
                      value={form.studentBillings[s.id] ?? ''}
                      onChange={(e) => setStudentBilling(s.id, e.target.value)}
                      placeholder="수강료"
                      className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:border-blue-400"
                    />
                    <span className="text-xs text-gray-400">원</span>
                  </div>
                ))
              )}
            </div>
          )}
        </Field>

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

      {/* Phase 35 — 반 생성 후 근무표 자동 추가 제안 */}
      {shiftSuggestion && (
        <BulkShiftSuggestionSheet
          open={!!shiftSuggestion}
          lessonsByStaff={shiftSuggestion}
          onClose={() => {
            setShiftSuggestion(null);
            onClose?.();
          }}
        />
      )}
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
