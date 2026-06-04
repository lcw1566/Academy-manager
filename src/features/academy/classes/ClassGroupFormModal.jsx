import { useMemo, useState } from 'react';
import { ChevronRight, AlertTriangle, Check } from 'lucide-react';
import Modal from '../../../components/Modal';
import OptionSelectSheet from '../../../components/OptionSelectSheet';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyClassGroup,
  updateClassGroup as updateServerClassGroup,
  createAcademyClassSessionsBulk,
} from '../../../services/supabase/domainApi';
// Phase 44.6 / Phase B — class_schedule_rules write-through.
import {
  createClassScheduleRule,
  listClassScheduleRules,
  updateClassScheduleRule,
} from '../../../services/supabase/scheduleRulesApi';
import { OWNER_TEACHER_ID } from '../../../utils/format';
import BulkShiftSuggestionSheet from '../work/BulkShiftSuggestionSheet';
import { hhmmToMin } from '../../../utils/shiftCoverage';
import {
  buildEffectiveStaffShifts,
  getUncoveredStaffSessions,
} from '../../../utils/staffShiftCoverage';

function emptyToNull(v) {
  if (v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
}

function addDaysYMD(ymd, days) {
  const base = ymd ? new Date(`${ymd}T00:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return new Date().toISOString().slice(0, 10);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

// 로컬 반 폼 → Supabase class_groups snake_case payload.
// student_ids / student_billings 는 academyStudents 에서 serverId 가 있는 학생만
// 서버 uuid 로 매핑. serverId 없는 학생은 서버 row 에서 제외 (로컬은 그대로 유지).
// 보조강사는 수업 회차가 아니라 클리닉/근무 쪽에서 관리한다.
// 기존 DB 컬럼은 호환을 위해 남겨두지만 새 저장 payload 에는 빈 배열만 보낸다.
// id / academy_id / user_id / mode 는 createAcademyClassGroup 에서 자동 주입.
// Phase 44 — teacher_user_id (auth.users.id) 를 함께 기록해 cross-device 매칭 가능.
//   - form.teacherId === OWNER_TEACHER_ID ('owner') 이면 ownerUserId (현재 로그인 user.id)
//   - 그 외에는 academyTeachers[i].serverUserId 로 매핑
//   - 매핑 실패 시 null (legacy fallback)
function resolveTeacherUserId(localTeacherId, academyTeachers, ownerUserId) {
  if (!localTeacherId) return null;
  if (localTeacherId === OWNER_TEACHER_ID) return ownerUserId || null;
  const t = academyTeachers.find((x) => x.id === localTeacherId);
  return t?.serverUserId || null;
}

function mapClassGroupFormToServerPayload(form, academyStudents, academyAssistants = [], academyTeachers = [], ownerUserId = null) {
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

  const monthlyFee = Number(form.monthlyFee) || 0;
  const defaultBilling = monthlyFee > 0 ? { monthlyFee } : {};

  return {
    name: form.name?.trim() ?? '',
    subject: emptyToNull(form.subject),
    level: emptyToNull(form.level),
    teacher_id: emptyToNull(form.teacherId),
    teacher_type: form.teacherId === OWNER_TEACHER_ID ? 'owner' : 'teacher',
    teacher_user_id: resolveTeacherUserId(form.teacherId, academyTeachers, ownerUserId),
    student_ids: serverStudentIds,
    assistant_ids: [],
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

// Phase 44.6 / Phase B — form → class_schedule_rules row 배열.
//   - weekdayTimes 가 있으면 요일별 시간 별도 사용. 없으면 form.startTime/endTime.
//   - 요일은 한글 → 0~6 (0=일).
//   - teacher_user_id 는 resolveTeacherUserId 로 매핑.
//   - assistant_ids 는 더 이상 수업 배정에 사용하지 않으므로 항상 빈 배열.
const DOW_KO_TO_NUM = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 0 };

function buildClassScheduleRulePayloads(form, academyTeachers, academyAssistants, ownerUserId) {
  const teacherUserId = resolveTeacherUserId(form.teacherId, academyTeachers, ownerUserId);
  const weekdayList = Array.isArray(form.weekdays) ? form.weekdays : [];
  const rows = [];
  for (const ko of weekdayList) {
    const dow = DOW_KO_TO_NUM[ko];
    if (dow === undefined) continue;
    const perDay = form.weekdayTimes?.[ko];
    const startTime = perDay?.startTime || form.startTime || '';
    const endTime = perDay?.endTime || form.endTime || '';
    if (!startTime || !endTime) continue;
    rows.push({
      day_of_week: dow,
      start_time: startTime,
      end_time: endTime,
      teacher_user_id: teacherUserId || null,
      assistant_ids: [],
      room: emptyToNull(form.room),
      is_active: true,
    });
  }
  return rows;
}

// local classSession → Supabase class_sessions snake_case payload.
// class_group_id 는 호출처에서 (serverGroupId) 로 명시적으로 전달.
// student_ids 는 학생 serverId 가 있는 항목만 포함.
// assistant_ids 는 기존 스키마 호환을 위해 빈 배열로만 보낸다.
export function mapClassSessionToServerPayload(localSession, classGroupServerId, academyStudents, academyAssistants = [], academyTeachers = [], ownerUserId = null) {
  const studentById = new Map(academyStudents.map((s) => [s.id, s]));
  const serverStudentIds = (localSession.studentIds || [])
    .map((localId) => studentById.get(localId)?.serverId)
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
    // Phase 44 — server-stable 매칭 키.
    teacher_user_id: resolveTeacherUserId(teacherId, academyTeachers, ownerUserId),
    student_ids: serverStudentIds,
    assistant_ids: [],
    status: localSession.status || 'scheduled',
    memo: emptyToNull(localSession.memo),
  };
}

// bulk insert 결과를 local sessions 와 매칭. (date, start_time) 조합이
// 같은 class_group 안에서 unique 하므로 이를 key 로 사용.
export function matchSessionPairs(localSessions, serverSessions) {
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
const SUBJECT_OPTIONS = [
  { value: '국어', label: '국어' },
  { value: '영어', label: '영어' },
  { value: '수학', label: '수학' },
  { value: '과학', label: '과학' },
  { value: '사회', label: '사회' },
  { value: '역사', label: '역사' },
  { value: '논술', label: '논술' },
  { value: '한국사', label: '한국사' },
  { value: '통합과학', label: '통합과학' },
  { value: '기타', label: '기타' },
];
const LEVEL_GROUPS = [
  {
    label: '초등',
    options: [
      { value: '초1', label: '초1' },
      { value: '초2', label: '초2' },
      { value: '초3', label: '초3' },
      { value: '초4', label: '초4' },
      { value: '초5', label: '초5' },
      { value: '초6', label: '초6' },
    ],
  },
  {
    label: '중등',
    options: [
      { value: '중1', label: '중1' },
      { value: '중2', label: '중2' },
      { value: '중3', label: '중3' },
    ],
  },
  {
    label: '고등',
    options: [
      { value: '고1', label: '고1' },
      { value: '고2', label: '고2' },
      { value: '고3', label: '고3' },
    ],
  },
  {
    label: '기타',
    options: [
      { value: '입문', label: '입문' },
      { value: '기본', label: '기본' },
      { value: '심화', label: '심화' },
      { value: '내신', label: '내신' },
      { value: '수능', label: '수능' },
      { value: '기타', label: '기타' },
    ],
  },
];

// Phase 40 — 강사 가용성 분류:
//   - 'noSchedule' : 근무 일정이 하나도 없음 (취소 제외)
//   - 'mismatch'   : 일정은 있지만 선택한 요일/시간에 cover 가 없음
//   - 'covered'    : 선택한 모든 요일·시간이 근무 안에 들어 있음
function classifyTeacherAvailability({
  staffId, shifts, weekdays = [], timesByWeekday, fallbackStart, fallbackEnd, useSameTime,
}) {
  if (!staffId) return null;
  const live = (shifts || []).filter((sh) => sh.staffId === staffId && sh.status !== 'canceled');
  if (live.length === 0) return 'noSchedule';
  if (weekdays.length === 0) return 'covered';
  const KO_DOW = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 0 };
  const shiftsByDow = new Map();
  for (const sh of live) {
    if (!sh.date) continue;
    const [y, m, d] = sh.date.split('-').map(Number);
    if (!y || !m || !d) continue;
    const dow = new Date(y, m - 1, d).getDay();
    if (!shiftsByDow.has(dow)) shiftsByDow.set(dow, []);
    shiftsByDow.get(dow).push(sh);
  }
  let allCovered = true;
  for (const day of weekdays) {
    const dow = KO_DOW[day];
    if (dow == null) continue;
    const dayShifts = shiftsByDow.get(dow) || [];
    if (dayShifts.length === 0) { allCovered = false; continue; }
    const t = useSameTime ? { startTime: fallbackStart, endTime: fallbackEnd }
                          : (timesByWeekday?.[day] || { startTime: fallbackStart, endTime: fallbackEnd });
    const lStart = hhmmToMin(t.startTime);
    const lEnd = hhmmToMin(t.endTime);
    if (lStart == null || lEnd == null) { allCovered = false; continue; }
    const ok = dayShifts.some((sh) => {
      const sStart = hhmmToMin(sh.scheduledStartTime);
      const sEnd = hhmmToMin(sh.scheduledEndTime);
      return sStart != null && sEnd != null && sStart <= lStart && lEnd <= sEnd;
    });
    if (!ok) allCovered = false;
  }
  return allCovered ? 'covered' : 'mismatch';
}

export default function ClassGroupFormModal({ editGroup, onClose }) {
  const {
    addClassGroup, updateClassGroup, setClassGroupServerId, setClassSessionServerIds,
    academyStudents, academyTeachers, academyAssistants = [], academyProfile, showToast,
    setActiveTab,
  } = useAcademyStore();
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUserId = useAuthStore((s) => s.user?.id);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerClassGroups = useWorkspaceStore((s) => s.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const staffWorkRules = useWorkspaceStore((s) => s.staffWorkRules) ?? [];
  const staffWorkExceptions = useWorkspaceStore((s) => s.staffWorkExceptions) ?? [];
  const [submitting, setSubmitting] = useState(false);
  // Phase 35 — 반 생성/수정 후 근무표 자동 추가 제안 sheet.
  const [shiftSuggestion, setShiftSuggestion] = useState(null);
  // Phase 37 — 과목/학년 bottom sheet 열림 상태.
  const [subjectSheetOpen, setSubjectSheetOpen] = useState(false);
  const [levelSheetOpen, setLevelSheetOpen] = useState(false);
  const ownerLabel = academyProfile?.ownerName?.trim() || '원장';

  // Phase 38 — 요일별 시간 토글. weekdayTimes 가 명시적으로 들어있으면 OFF 로 시작.
  const initialUseSameTime = !editGroup?.weekdayTimes
    || Object.keys(editGroup.weekdayTimes || {}).length === 0;
  const [form, setForm] = useState({
    name: editGroup?.name || '',
    subject: editGroup?.subject || '',
    level: editGroup?.level || '',
    teacherId: editGroup?.teacherId || '',
    studentIds: editGroup?.studentIds || [],
    weekdays: editGroup?.weekdays || [],
    startTime: editGroup?.startTime || '16:00',
    endTime: editGroup?.endTime || '18:00',
    useSameTime: initialUseSameTime,
    weekdayTimes: editGroup?.weekdayTimes || {},
    room: editGroup?.room || '',
    startDate: editGroup?.startDate || new Date().toISOString().slice(0, 10),
    endDate: editGroup?.endDate || '',
    billingMode: editGroup?.billingMode || 'same',
    monthlyFee: editGroup?.monthlyFee ? String(editGroup.monthlyFee) : '',
    studentBillings: editGroup?.studentBillings || {},
    memo: editGroup?.memo || '',
    status: editGroup?.status || 'active',
  });
  const [periodStartMode, setPeriodStartMode] = useState(editGroup ? 'custom' : 'today');
  const [periodEndMode, setPeriodEndMode] = useState(editGroup?.endDate ? 'until' : 'forever');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const coverageRange = useMemo(() => {
    const fromDate = form.startDate || new Date().toISOString().slice(0, 10);
    return { fromDate, toDate: addDaysYMD(fromDate, 56) };
  }, [form.startDate]);

  const effectiveCoverageShifts = useMemo(() => buildEffectiveStaffShifts({
    actualShifts: academyStaffShifts,
    rules: staffWorkRules,
    exceptions: staffWorkExceptions,
    fromDate: coverageRange.fromDate,
    toDate: coverageRange.toDate,
    academyTeachers,
    academyAssistants,
  }), [
    academyStaffShifts,
    staffWorkRules,
    staffWorkExceptions,
    coverageRange,
    academyTeachers,
    academyAssistants,
  ]);

  const toggleWeekday = (day) =>
    setForm((f) => {
      const has = f.weekdays.includes(day);
      const weekdays = has ? f.weekdays.filter((d) => d !== day) : [...f.weekdays, day];
      // 요일을 추가하면 그 요일의 weekdayTimes 항목을 현재 공통 시간으로 시드.
      // 요일을 빼면 그 요일의 weekdayTimes 항목 제거.
      const weekdayTimes = { ...f.weekdayTimes };
      if (has) {
        delete weekdayTimes[day];
      } else if (!weekdayTimes[day]) {
        weekdayTimes[day] = { startTime: f.startTime, endTime: f.endTime };
      }
      return { ...f, weekdays, weekdayTimes };
    });

  // Phase 38 — 같은 시간 토글. ON→OFF 시 현재 공통 시간을 각 요일에 복사,
  // OFF→ON 시 첫 요일의 시간을 공통 시간으로 끌어올림.
  const toggleSameTime = () =>
    setForm((f) => {
      if (f.useSameTime) {
        const wt = { ...f.weekdayTimes };
        for (const day of f.weekdays) {
          if (!wt[day]) wt[day] = { startTime: f.startTime, endTime: f.endTime };
        }
        return { ...f, useSameTime: false, weekdayTimes: wt };
      }
      const first = f.weekdays[0];
      const seed = first ? f.weekdayTimes[first] : null;
      return {
        ...f,
        useSameTime: true,
        startTime: seed?.startTime || f.startTime,
        endTime: seed?.endTime || f.endTime,
      };
    });

  const setWeekdayTime = (day, key, value) =>
    setForm((f) => ({
      ...f,
      weekdayTimes: {
        ...f.weekdayTimes,
        [day]: { ...(f.weekdayTimes[day] || {}), [key]: value },
      },
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
    if (!form.startDate) return alert('수업을 언제 시작할지 선택해주세요.');
    if (periodEndMode === 'until' && !form.endDate) return alert('수업을 언제까지 진행할지 선택해주세요.');
    if (periodEndMode === 'until' && form.endDate < form.startDate) {
      return alert('수업을 끝내는 날은 처음 시작하는 날보다 뒤여야 해요.');
    }

    // Phase 38 — 요일별 시간이 다를 때:
    //   · weekdayTimes 는 선택된 요일만 남기고 저장.
    //   · group.startTime / endTime 은 첫 요일의 시간으로 채워 list/detail 의
    //     기본 표시와 server fallback 을 유지 (cross-device 호환).
    let savedStartTime = form.startTime;
    let savedEndTime = form.endTime;
    let savedWeekdayTimes = undefined;
    if (!form.useSameTime && form.weekdays.length > 0) {
      savedWeekdayTimes = {};
      for (const day of form.weekdays) {
        const t = form.weekdayTimes[day] || {};
        savedWeekdayTimes[day] = {
          startTime: t.startTime || form.startTime,
          endTime: t.endTime || form.endTime,
        };
      }
      const first = form.weekdays[0];
      const firstTimes = savedWeekdayTimes[first];
      if (firstTimes) {
        savedStartTime = firstTimes.startTime;
        savedEndTime = firstTimes.endTime;
      }
    }

    // form.useSameTime 은 UI 상태일 뿐이므로 저장 데이터에서 제외.
    // weekdayTimes 의 유무가 source of truth.
    const { useSameTime: _useSameTime, assistantId: _assistantId, ...formRest } = form;
    // Phase 44 — server-stable user id 를 로컬에도 함께 저장하여, 학원장 본인 단말의
    // 즉시 매칭(다른 단말 hydrate 전)도 정상 동작하도록 한다.
    const teacherUserIdForData = resolveTeacherUserId(form.teacherId, academyTeachers, authUserId);
    const data = {
      ...formRest,
      startTime: savedStartTime,
      endTime: savedEndTime,
      weekdayTimes: savedWeekdayTimes,
      teacherUserId: teacherUserIdForData || '',
      assistantId: '',
      assistantIds: [],
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
              mapClassGroupFormToServerPayload(data, academyStudents, academyAssistants, academyTeachers, authUserId),
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

          // Phase 44.6 / Phase B — class_schedule_rules 재정의 (best-effort).
          // 안전한 패턴: 기존 active rule 들 deactivate → 새 rule INSERT.
          // 기존 lesson_records / attendance_records 는 별도 테이블이므로 영향 없음.
          try {
            const existingRules = await listClassScheduleRules(currentAcademyId);
            const groupRules = existingRules.filter(
              (r) => r.class_group_id === editGroup.serverId && r.is_active,
            );
            for (const r of groupRules) {
              try { await updateClassScheduleRule(r.id, { is_active: false }); }
              catch (err) { console.warn('[supabase] deactivate rule failed', err); }
            }
            const rulePayloads = buildClassScheduleRulePayloads(data, academyTeachers, academyAssistants, authUserId);
            for (const rp of rulePayloads) {
              try {
                await createClassScheduleRule({
                  academyId: currentAcademyId,
                  class_group_id: editGroup.serverId,
                  ...rp,
                });
              } catch (err) {
                console.warn('[supabase] createClassScheduleRule (edit) failed', err);
              }
            }
            await useWorkspaceStore.getState().loadClassScheduleRules?.();
          } catch (err) {
            console.warn('[supabase] reapply class rules failed', err);
          }
        }
      } else {
        // ── 생성 ──────────────────────────────────────────────
        // 1) localStorage: classGroup 생성 + classSessions 자동 생성. 둘 다 확보.
        const result = addClassGroup(data);
        const localGroup = result.group;
        const localSessions = result.sessions ?? [];

        // Phase 35 — 다음 7일 안에 있는 세션에 대해 담당 강사 근무표 제안.
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
          const teacherSessions = getUncoveredStaffSessions({
            shifts: effectiveCoverageShifts,
            staffId: teacher.id,
            sessions: upcoming.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime })),
          });
          lessonsByStaff.set(`teacher_${teacher.id}`, {
            staff: teacher,
            staffRole: 'teacher',
            sessions: teacherSessions,
          });
        }
        // 2) Supabase write-through — 화면은 로컬 저장 직후 닫고, 서버 동기화는 백그라운드 처리.
        if (isAuthenticated && currentAcademyId) {
          void (async () => {
            let serverGroup = null;
            try {
              serverGroup = await createAcademyClassGroup({
                academyId: currentAcademyId,
                ...mapClassGroupFormToServerPayload(data, academyStudents, academyAssistants, academyTeachers, authUserId),
              });
              if (serverGroup?.id && localGroup?.id) {
                setClassGroupServerId(localGroup.id, serverGroup.id);
              }
              await loadServerClassGroups();
            } catch (err) {
              console.error('[supabase] createAcademyClassGroup failed', err);
              showToast(
                err?.message
                  ? `반은 저장됐지만 서버 동기화에 실패했어요: ${err.message}`
                  : '반은 저장됐지만 서버 동기화에 실패했어요.',
                'error',
              );
              return;
            }

            // class_group 서버 저장 성공 시 sessions bulk insert 시도
            if (serverGroup?.id && localSessions.length > 0) {
              try {
                const sessionPayloads = localSessions.map((ls) =>
                  mapClassSessionToServerPayload(ls, serverGroup.id, academyStudents, academyAssistants, academyTeachers, authUserId)
                );
                const serverSessions = await createAcademyClassSessionsBulk({
                  academyId: currentAcademyId,
                  sessions: sessionPayloads,
                });
                // local ↔ server 매칭 (date + start_time 기준)
                const pairs = matchSessionPairs(localSessions, serverSessions);
                setClassSessionServerIds(pairs);
                await loadServerClassSessions();
              } catch (err) {
                console.error('[supabase] createAcademyClassSessionsBulk failed', err);
                showToast(
                  err?.message
                    ? `수업은 저장됐지만 서버 동기화에 실패했어요: ${err.message}`
                    : '수업은 저장됐지만 서버 동기화에 실패했어요.',
                  'error',
                );
              }
            }

            // Phase 44.6 / Phase B — class_schedule_rules INSERT (best-effort).
            // 룰 저장이 실패해도 사용자 흐름은 막지 않음 (legacy class_sessions 가 fallback).
            if (serverGroup?.id) {
              const rulePayloads = buildClassScheduleRulePayloads(data, academyTeachers, academyAssistants, authUserId);
              for (const rp of rulePayloads) {
                try {
                  await createClassScheduleRule({
                    academyId: currentAcademyId,
                    class_group_id: serverGroup.id,
                    ...rp,
                  });
                } catch (err) {
                  console.warn('[supabase] createClassScheduleRule failed', err);
                }
              }
              // 캐시 갱신 (best-effort).
              try {
                await useWorkspaceStore.getState().loadClassScheduleRules?.();
              } catch { /* ignore */ }
            }
          })();
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

  // Phase 37 — 시간/날짜 inline validation. 종료가 시작보다 빠르면 에러 메시지만 표시
  // (저장은 막지 않음 — 사용자가 잠시 잘못 입력한 중간 상태를 막으면 UX 가 답답해짐).
  const timeError = useMemo(() => {
    if (!form.startTime || !form.endTime) return null;
    return form.endTime <= form.startTime ? '종료 시간은 시작 시간보다 늦어야 해요.' : null;
  }, [form.startTime, form.endTime]);
  const dateError = useMemo(() => {
    if (periodEndMode !== 'until') return null;
    if (!form.endDate) return '수업을 언제까지 진행할지 선택해주세요.';
    if (!form.startDate) return null;
    return form.endDate < form.startDate ? '수업을 끝내는 날은 처음 시작하는 날보다 뒤여야 해요.' : null;
  }, [form.startDate, form.endDate, periodEndMode]);

  // Phase 38 — 요일별 시간 모드일 때 각 요일 시간 검증.
  const perDayErrors = useMemo(() => {
    if (form.useSameTime) return {};
    const errs = {};
    for (const day of form.weekdays) {
      const t = form.weekdayTimes[day] || {};
      if (t.startTime && t.endTime && t.endTime <= t.startTime) {
        errs[day] = '종료가 시작보다 늦어야 해요.';
      }
    }
    return errs;
  }, [form.useSameTime, form.weekdays, form.weekdayTimes]);

  // Phase 40 — 강사 근무 가용성 체크 (인라인 안내용).
  const teacherAvailability = useMemo(() => {
    if (!form.teacherId || form.teacherId === OWNER_TEACHER_ID) return null;
    return classifyTeacherAvailability({
      staffId: form.teacherId,
      shifts: effectiveCoverageShifts,
      weekdays: form.weekdays,
      timesByWeekday: form.weekdayTimes,
      fallbackStart: form.startTime,
      fallbackEnd: form.endTime,
      useSameTime: form.useSameTime,
    });
  }, [form.teacherId, form.weekdays, form.weekdayTimes, form.startTime, form.endTime, form.useSameTime, effectiveCoverageShifts]);

  // 직원 탭으로 이동하여 근무 시간을 설정. 폼은 닫는다 (state 가 사라지더라도
  // 강사 배정 자체는 직원 일정 등록 후 다시 진행하는 게 자연스러움).
  const goToStaffSchedule = () => {
    setActiveTab('staff');
    onClose?.();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editGroup ? '반 정보 수정' : '반 만들기'}
      size="wide"
      footer={
        <button
          onClick={handleSave}
          disabled={submitting}
          className="w-full bg-[#0064FF] text-white font-bold py-3.5 rounded-xl disabled:opacity-60 active:bg-[#0050cc] transition-colors"
        >
          {submitting ? '저장 중…' : editGroup ? '수정 완료' : '반 만들기'}
        </button>
      }
    >
      <div className="flex flex-col gap-5 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-5">
        {/* ── 좌측 (데스크톱) · 기본 정보 ──────────────────────────── */}
        <div className="flex flex-col gap-4">
          <SectionTitle>기본 정보</SectionTitle>

          <Field label="반 이름 *">
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="예: 중2 영어 A반"
              className="input"
            />
          </Field>

          <Field label="과목">
            <SelectRow
              value={form.subject}
              placeholder="과목을 선택해주세요"
              onClick={() => setSubjectSheetOpen(true)}
            />
          </Field>

          <Field label="학년/레벨">
            <SelectRow
              value={form.level}
              placeholder="학년 또는 레벨을 선택해주세요"
              onClick={() => setLevelSheetOpen(true)}
            />
          </Field>

          <Field label="담당 강사">
            <select
              value={form.teacherId}
              onChange={(e) => set('teacherId', e.target.value)}
              className="input"
            >
              <option value="">강사 선택</option>
              <option value={OWNER_TEACHER_ID}>{ownerLabel} (원장 본인)</option>
              {academyTeachers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <AvailabilityBanner status={teacherAvailability} onGoToStaff={goToStaffSchedule} />
          </Field>

        </div>

        {/* ── 우측 (데스크톱) · 일정 설정 ──────────────────────────── */}
        <div className="flex flex-col gap-4">
          <SectionTitle>일정 설정</SectionTitle>

          <Field label="수업 요일 *" hint="여러 요일을 선택할 수 있어요.">
            <div className="flex gap-1.5 bg-[#F2F4F6] rounded-2xl p-1.5">
              {WEEKDAYS.map((day) => {
                const selected = form.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                      selected
                        ? 'bg-[#0064FF] text-white shadow-sm'
                        : 'bg-transparent text-[#4E5968] active:bg-white/60'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="수업 시간">
            {/* Phase 38 — 같은 시간 토글 */}
            <button
              type="button"
              onClick={toggleSameTime}
              className="w-full flex items-center justify-between bg-[#F2F4F6] rounded-xl px-4 py-3 mb-2.5"
            >
              <span className="text-xs font-semibold text-[#191F28]">요일별 시간이 같아요</span>
              <span
                className={`relative inline-flex items-center w-10 h-6 rounded-full transition-colors ${
                  form.useSameTime ? 'bg-[#0064FF]' : 'bg-[#D1D6DB]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    form.useSameTime ? 'translate-x-[18px]' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>

            {form.useSameTime ? (
              <>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => set('startTime', e.target.value)}
                    className="input"
                  />
                  <span className="text-gray-400 text-sm">~</span>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => set('endTime', e.target.value)}
                    className="input"
                  />
                </div>
                {timeError && (
                  <p className="text-[11px] text-red-500 mt-1.5">{timeError}</p>
                )}
              </>
            ) : form.weekdays.length === 0 ? (
              <p className="text-[11px] text-gray-400 px-1">
                위에서 수업 요일을 먼저 선택해주세요.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {form.weekdays.map((day) => {
                  const t = form.weekdayTimes[day] || {};
                  const err = perDayErrors[day];
                  return (
                    <div key={day}>
                      <div className="grid grid-cols-[44px_1fr_auto_1fr] items-center gap-2">
                        <span className="text-sm font-bold text-[#191F28]">{day}요일</span>
                        <input
                          type="time"
                          value={t.startTime || ''}
                          onChange={(e) => setWeekdayTime(day, 'startTime', e.target.value)}
                          className="input"
                        />
                        <span className="text-gray-400 text-sm">~</span>
                        <input
                          type="time"
                          value={t.endTime || ''}
                          onChange={(e) => setWeekdayTime(day, 'endTime', e.target.value)}
                          className="input"
                        />
                      </div>
                      {err && (
                        <p className="text-[11px] text-red-500 mt-1 pl-[52px]">{err}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Field>

          <Field label="수업은 언제 시작하나요?">
            <div className="grid grid-cols-2 gap-2">
              <ChoiceCard
                active={periodStartMode === 'today'}
                title="오늘부터"
                onClick={() => {
                  setPeriodStartMode('today');
                  set('startDate', new Date().toISOString().slice(0, 10));
                }}
              />
              <ChoiceCard
                active={periodStartMode === 'custom'}
                title="직접 선택"
                onClick={() => setPeriodStartMode('custom')}
              />
            </div>
            {periodStartMode === 'custom' && (
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
                className="input mt-2"
              />
            )}
          </Field>

          <Field label="수업은 언제까지 진행하나요?">
            <div className="grid grid-cols-2 gap-2">
              <ChoiceCard
                active={periodEndMode === 'forever'}
                title="계속 진행"
                onClick={() => {
                  setPeriodEndMode('forever');
                  set('endDate', '');
                }}
              />
              <ChoiceCard
                active={periodEndMode === 'until'}
                title="특정 날짜까지"
                onClick={() => setPeriodEndMode('until')}
              />
            </div>
            {periodEndMode === 'until' && (
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => set('endDate', e.target.value)}
                className="input mt-2"
              />
            )}
            {dateError && (
              <p className="text-[11px] text-red-500 mt-1.5">{dateError}</p>
            )}
          </Field>

          <Field label="강의실 (선택)">
            <input
              value={form.room}
              onChange={(e) => set('room', e.target.value)}
              placeholder="예: 1강의실"
              className="input"
            />
          </Field>
        </div>

        {/* ── 하단 · 학생/수강료/메모 (full-width) ─────────────────── */}
        <div className="md:col-span-2 flex flex-col gap-4">
          {academyStudents.length > 0 && (
            <Field label={`학생 배정 (${form.studentIds.length}/${academyStudents.length})`}>
              <div className="flex flex-col gap-2">
                {academyStudents.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStudent(s.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                      form.studentIds.includes(s.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${form.studentIds.includes(s.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`} />
                    <span className="text-sm font-medium text-gray-800 flex-1">{(s.name || '?')}</span>
                    {s.grade && <span className="text-xs text-gray-400">{s.grade}</span>}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="수강료 설정">
            <div className="flex gap-2 mb-3">
              {[
                { value: 'same', label: '동일 수강료' },
                { value: 'perStudent', label: '학생별 수강료' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('billingMode', value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                    form.billingMode === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-500'
                  }`}
                >
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
            <textarea
              value={form.memo}
              onChange={(e) => set('memo', e.target.value)}
              rows={2}
              placeholder="특이사항 등"
              className="input resize-none"
            />
          </Field>

          {!editGroup && (
            <div className="bg-blue-50 rounded-xl px-4 py-3">
              <p className="text-xs text-blue-700 font-semibold mb-1">수업 회차 자동 생성</p>
              <p className="text-xs text-blue-600">
                매주 {form.weekdays.join(', ') || '선택한 요일'} {form.useSameTime ? `${form.startTime}~${form.endTime}` : '요일별 시간'} 수업이에요.
                {' '}
                {periodEndMode === 'until' && form.endDate
                  ? `${form.startDate}부터 ${form.endDate}까지 진행해요.`
                  : `${form.startDate}부터 계속 진행해요.`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 과목 선택 sheet */}
      <OptionSelectSheet
        open={subjectSheetOpen}
        onClose={() => setSubjectSheetOpen(false)}
        title="과목 선택"
        options={SUBJECT_OPTIONS}
        value={form.subject}
        onSelect={(v) => set('subject', v)}
      />

      {/* 학년/레벨 선택 sheet — 그룹별 */}
      <OptionSelectSheet
        open={levelSheetOpen}
        onClose={() => setLevelSheetOpen(false)}
        title="학년/레벨 선택"
        groups={LEVEL_GROUPS}
        value={form.level}
        onSelect={(v) => set('level', v)}
      />

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

// Phase 40 — 강사 배정 가용성 안내 (인라인 배너).
//   covered    : 근무 시간 안에서 배정돼요. (성공 톤)
//   noSchedule : 아직 이 선생님의 정해진 근무 시간이 없어요. → "근무 시간 정하러 가기"
//   mismatch   : 근무 시간 밖 수업이에요. → 저장 시 BulkShiftSuggestionSheet 가 처리.
function AvailabilityBanner({ status, onGoToStaff }) {
  if (!status) return null;
  if (status === 'covered') {
    return (
      <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
        <Check size={11} /> 근무 시간 안에서 배정돼요.
      </p>
    );
  }
  if (status === 'noSchedule') {
    return (
      <div className="mt-2 rounded-2xl bg-amber-50 px-3 py-2.5">
        <p className="text-xs font-bold text-amber-700 leading-snug">
          아직 이 선생님의 정해진 근무 시간이 없어요.
        </p>
        <p className="text-[11px] text-amber-700/80 mt-0.5 leading-relaxed">
          수업 시간을 근무로 잡으려면 먼저 주간 근무 시간을 설정해주세요.
        </p>
        {onGoToStaff && (
          <button
            type="button"
            onClick={onGoToStaff}
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-amber-700 active:bg-amber-100"
          >
            근무 시간 정하러 가기
            <ChevronRight size={11} />
          </button>
        )}
      </div>
    );
  }
  // mismatch
  return (
    <div className="mt-2 rounded-2xl bg-amber-50 px-3 py-2.5 flex items-start gap-2">
      <AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-amber-700 leading-snug">
          근무 시간 밖 수업이에요.
        </p>
        <p className="text-[11px] text-amber-700/80 mt-0.5 leading-relaxed">
          저장하면 "수업 시간을 근무에 포함할지" 물어볼게요.
        </p>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1.5">{hint}</p>}
    </div>
  );
}

function ChoiceCard({ active, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left active:opacity-80 ${
        active ? 'border-[#0064FF] bg-blue-50' : 'border-gray-200 bg-white'
      }`}
    >
      <p className={`text-sm font-bold ${active ? 'text-[#0064FF]' : 'text-[#191F28]'}`}>{title}</p>
      {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
    </button>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="hidden md:block text-[11px] font-bold text-gray-400 tracking-wide uppercase">
      {children}
    </div>
  );
}

function SelectRow({ value, placeholder, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-4 bg-white active:bg-gray-50 transition-colors"
      style={{ minHeight: 48 }}
    >
      <span className={`text-sm ${value ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>
        {value || placeholder}
      </span>
      <ChevronRight size={18} className="text-gray-300" />
    </button>
  );
}
