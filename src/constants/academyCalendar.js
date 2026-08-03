export const ACADEMY_CALENDAR_CATEGORIES = [
  { id: 'academy_break', label: '학원 휴원·방학', emoji: '🏡', color: 'rose' },
  { id: 'school_exam', label: '학교 시험', emoji: '📝', color: 'amber' },
  { id: 'school_schedule', label: '학교 일정', emoji: '🏫', color: 'violet' },
  { id: 'academy_event', label: '학원 행사', emoji: '🎉', color: 'emerald' },
  { id: 'consultation', label: '상담 일정', emoji: '💬', color: 'sky' },
  { id: 'other', label: '기타', emoji: '📌', color: 'gray' },
];

export const ACADEMY_CALENDAR_CATEGORY_MAP = Object.fromEntries(
  ACADEMY_CALENDAR_CATEGORIES.map((category) => [category.id, category]),
);

export const CALENDAR_CATEGORY_TONES = {
  academy_break: {
    card: 'border-rose-200 bg-rose-50',
    title: 'text-rose-900',
    time: 'text-rose-600',
    dot: 'bg-rose-500',
  },
  school_exam: {
    card: 'border-amber-200 bg-amber-50',
    title: 'text-amber-900',
    time: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  school_schedule: {
    card: 'border-violet-200 bg-violet-50',
    title: 'text-violet-900',
    time: 'text-violet-600',
    dot: 'bg-violet-500',
  },
  academy_event: {
    card: 'border-emerald-200 bg-emerald-50',
    title: 'text-emerald-900',
    time: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  consultation: {
    card: 'border-sky-200 bg-sky-50',
    title: 'text-sky-900',
    time: 'text-sky-700',
    dot: 'bg-sky-500',
  },
  other: {
    card: 'border-gray-200 bg-gray-50',
    title: 'text-gray-900',
    time: 'text-gray-600',
    dot: 'bg-gray-500',
  },
};

export function getAcademyCalendarCategory(categoryId) {
  return ACADEMY_CALENDAR_CATEGORY_MAP[categoryId] || ACADEMY_CALENDAR_CATEGORY_MAP.other;
}
