// staffPermissions.js
//
// Phase 30 — 학원 staff 의 권한(permissions) / 범위(scope) 도우미.
//
// 데이터 위치:
//   - server : academy_staff_profiles.permissions (jsonb), .scope (jsonb)
//   - local  : academyTeachers[i].permissions / scope, academyAssistants[i].permissions / scope
//
// 빈 객체({}) 는 "기본 권한" 으로 해석한다 — 역할별 default 가 적용된다.
// 명시적 false 가 있으면 차단, 명시적 true 가 있으면 허용.
//
// 이 단계에서는 UI gating 만 처리한다. RLS 수준 검증은 향후.

// 역할별 기본 권한 (PERMISSION_DEFAULTS)
//   teacher:  학생/수업/출결 편집 + 급여 조회
//   assistant: 클리닉 편집 + 학생/급여 조회 (수업/출결 편집은 default off)
export const PERMISSION_DEFAULTS = {
  teacher: {
    canViewStudents: true,
    canEditLessonRecords: true,
    canEditAttendance: true,
    canEditClinicRecords: false,
    canViewPayroll: true,
    canViewPayments: false,
    canManageClasses: false,
  },
  assistant: {
    canViewStudents: true,
    canEditLessonRecords: false,
    canEditAttendance: false,
    canEditClinicRecords: true,
    canViewPayroll: true,
    canViewPayments: false,
    canManageClasses: false,
  },
};

export const PERMISSION_LABELS = {
  canViewStudents: '학생 정보 조회',
  canEditLessonRecords: '수업 기록 작성/수정',
  canEditAttendance: '출결 기록 작성/수정',
  canEditClinicRecords: '클리닉 기록 작성/수정',
  canViewPayroll: '본인 급여 조회',
  canViewPayments: '학원 수납 정보 조회',
  canManageClasses: '반/회차 생성·수정',
};

export const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS);

// staff 항목에서 effective permissions 를 계산.
// custom: { canViewStudents: true, ... } (academy_staff_profiles.permissions)
// role:   'teacher' | 'assistant'
export function resolvePermissions(role, custom) {
  const base = PERMISSION_DEFAULTS[role] || PERMISSION_DEFAULTS.teacher;
  if (!custom || typeof custom !== 'object') return { ...base };
  return { ...base, ...custom };
}

// 단일 권한 체크 — staff 가 없거나(원장) 매칭 안 되면 owner default = true.
export function staffCan(staff, permissionKey, role = 'teacher') {
  if (!staff) return true; // owner / undefined 는 권한 제한 없음
  const effective = resolvePermissions(staff.role || role, staff.permissions);
  return !!effective[permissionKey];
}

// 현재 사용자(role + matched staffProfile) 기준으로 권한 체크.
// - role='owner' 면 항상 true
// - role='teacher'/'assistant' 면 staffProfile.permissions 로 판단 (없으면 default)
export function currentUserCan({ role, staffProfile }, permissionKey) {
  if (role === 'owner') return true;
  if (role !== 'teacher' && role !== 'assistant') return true;
  return staffCan({ role, permissions: staffProfile?.permissions }, permissionKey, role);
}

// scope helpers — 빈 scope 는 "제한 없음".
export function isStudentInScope(scope, studentId) {
  if (!scope || !Array.isArray(scope.studentIds) || scope.studentIds.length === 0) return true;
  return scope.studentIds.includes(studentId);
}

export function isClassGroupInScope(scope, classGroupId) {
  if (!scope || !Array.isArray(scope.classGroupIds) || scope.classGroupIds.length === 0) return true;
  return scope.classGroupIds.includes(classGroupId);
}

export function isSubjectInScope(scope, subject) {
  if (!scope || !Array.isArray(scope.subjects) || scope.subjects.length === 0) return true;
  return scope.subjects.includes(subject);
}
