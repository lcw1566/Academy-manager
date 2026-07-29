// staffPermissions.js
//
// Phase 30 — 학원 staff 의 권한(permissions) / 범위(scope) 도우미.
//
// 권한의 source of truth:
//   1) 원장: 전체 권한
//   2) 운영 매니저: 학원 운영 권한
//   3) 선생님: 담당 반/회차/학생 범위의 기록 권한
//
// 예전 개인별 permissions jsonb는 호환을 위해 DB에 남겨두지만 권한 판정에는
// 사용하지 않는다. 프런트와 RLS가 같은 역할 기본값을 사용해야 체크박스 저장
// 시점이나 로딩 순서에 따라 권한이 달라지지 않는다.

// 역할별 기본 권한 (PERMISSION_DEFAULTS)
//   teacher:  학생/수업/등하원 상태 편집 + 급여 조회
//   assistant: 이전 버전 호환 별칭이며 teacher와 같은 권한
//   manager:   데스크 실무 운영(학생·수납·직원·공유자료) + 본인 급여 조회.
//              학원 삭제/최종 설정/다른 직원 급여 관리는 포함하지 않는다.
export const PERMISSION_DEFAULTS = {
  teacher: {
    canViewStudents: true,
    canEditLessonRecords: true,
    canEditAttendance: true,
    canEditClinicRecords: true,
    canViewPayroll: true,
    canViewPayments: false,
    canManageClasses: false,
    canManageStudents: false,
    canManagePayments: false,
    canManageStaff: false,
    canManageStaffPermissions: false,
    canManageDrive: true,
  },
  assistant: {
    canViewStudents: true,
    canEditLessonRecords: true,
    canEditAttendance: true,
    canEditClinicRecords: true,
    canViewPayroll: true,
    canViewPayments: false,
    canManageClasses: false,
    canManageStudents: false,
    canManagePayments: false,
    canManageStaff: false,
    canManageStaffPermissions: false,
    canManageDrive: true,
  },
  manager: {
    canViewStudents: true,
    canEditLessonRecords: true,
    canEditAttendance: true,
    canEditClinicRecords: true,
    canViewPayroll: true,
    canViewPayments: true,
    canManageClasses: true,
    canManageStudents: true,
    canManagePayments: true,
    canManageStaff: true,
    // 역할 자체와 권한 정책은 원장만 변경한다.
    canManageStaffPermissions: false,
    canManageDrive: true,
  },
};

export const PERMISSION_LABELS = {
  canViewStudents: '학생 정보 조회',
  canEditLessonRecords: '수업 기록 작성/수정',
  canEditAttendance: '등하원·출석 기록',
  canEditClinicRecords: '클리닉 기록 작성/수정',
  canViewPayroll: '본인 급여 조회',
  canViewPayments: '학원 수납 정보 조회',
  canManageClasses: '반/회차 생성·수정',
  canManageStudents: '학생 등록·수정·삭제',
  canManagePayments: '수납 생성·수정·삭제',
  canManageStaff: '직원 초대·근무표 관리',
  canManageStaffPermissions: '선생님 권한 설정',
  canManageDrive: '공유 드라이브 사용',
};

export const PERMISSION_KEYS = Object.keys(PERMISSION_LABELS);

// staff 항목에서 effective permissions 를 계산.
// custom은 레거시 호출부 호환용이며 의도적으로 적용하지 않는다.
export function resolvePermissions(role, _custom) {
  const base = PERMISSION_DEFAULTS[role] || PERMISSION_DEFAULTS.teacher;
  return { ...base };
}

// 단일 권한 체크 — 원장은 currentUserCan에서 먼저 처리한다.
export function staffCan(staff, permissionKey, role = 'teacher') {
  if (!staff) return false;
  const effective = resolvePermissions(staff.role || role, staff.permissions);
  return !!effective[permissionKey];
}

// 현재 사용자 role 기준으로 권한 체크. staffProfile은 레거시 호출부 호환용이다.
// - role='owner' 면 항상 true
// - role='teacher'/'assistant'/'manager' 면 고정 역할 기본값으로 판단
export function currentUserCan({ role, staffProfile }, permissionKey) {
  if (role === 'owner') return true;
  if (!['teacher', 'assistant', 'manager'].includes(role)) return false;
  return staffCan({ role, permissions: staffProfile?.permissions }, permissionKey, role);
}

// 레거시 scope helpers. 실제 학원 담당 범위는 SQL 051 RLS가 배정 정보로 판정한다.
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
