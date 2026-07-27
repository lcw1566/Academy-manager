export const STUDENT_STATUS_OPTIONS = [
  {
    value: 'scheduled',
    label: '재원 예정',
    badgeClassName: 'border-blue-200 bg-blue-50 text-blue-700',
    selectedClassName: 'border-blue-500 bg-blue-50 text-blue-700',
  },
  {
    value: 'active',
    label: '재원',
    badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    selectedClassName: 'border-emerald-500 bg-emerald-50 text-emerald-700',
  },
  {
    value: 'paused',
    label: '휴원',
    badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
    selectedClassName: 'border-amber-400 bg-amber-50 text-amber-700',
  },
  {
    value: 'inactive',
    label: '퇴원',
    badgeClassName: 'border-gray-200 bg-gray-100 text-gray-600',
    selectedClassName: 'border-gray-400 bg-gray-100 text-gray-600',
  },
];

export function getStudentStatusMeta(status) {
  return STUDENT_STATUS_OPTIONS.find((option) => option.value === status)
    || STUDENT_STATUS_OPTIONS.find((option) => option.value === 'active');
}
