const FIELD_LABELS = {
  schoolType: '학교 구분',
  school: '학교',
  grade: '학년',
  parentTitle: '학부모 호칭',
  parentPhone: '학부모 연락처',
  contact: '연락처',
};

const SCHOOL_STUDENT_TYPES = new Set(['elementary', 'middle', 'high', 'university']);
const MINOR_SCHOOL_TYPES = new Set(['elementary', 'middle', 'high']);

export function getMissingStudentInformation(student = {}) {
  const missing = [];
  const schoolType = student.schoolType || '';

  if (!schoolType) missing.push('schoolType');
  if (SCHOOL_STUDENT_TYPES.has(schoolType)) {
    if (!String(student.school || student.schoolName || '').trim()) missing.push('school');
    if (!String(student.grade || '').trim()) missing.push('grade');
  }
  if (MINOR_SCHOOL_TYPES.has(schoolType)) {
    if (!String(student.parentTitle || '').trim()) missing.push('parentTitle');
    if (!String(student.parentPhone || '').trim()) missing.push('parentPhone');
  } else if (!String(student.phone || student.parentPhone || '').trim()) {
    missing.push('contact');
  }

  return missing.map((key) => ({
    key,
    label: FIELD_LABELS[key] || key,
  }));
}

