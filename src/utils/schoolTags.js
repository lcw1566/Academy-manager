const SCHOOL_TAG_COLORS = [
  'border-red-200 bg-red-50 text-red-700',
  'border-orange-200 bg-orange-50 text-orange-700',
  'border-amber-200 bg-amber-50 text-amber-700',
  'border-emerald-200 bg-emerald-50 text-emerald-700',
  'border-teal-200 bg-teal-50 text-teal-700',
  'border-sky-200 bg-sky-50 text-sky-700',
  'border-indigo-200 bg-indigo-50 text-indigo-700',
  'border-violet-200 bg-violet-50 text-violet-700',
  'border-pink-200 bg-pink-50 text-pink-700',
];

// 학교명 자체를 해시로 사용해 새로고침하거나 다른 화면에서 보더라도 같은 색을 유지한다.
export function getSchoolTagClassName(schoolName) {
  const normalized = String(schoolName || '').trim();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash * 31) + normalized.charCodeAt(index)) >>> 0;
  }
  return SCHOOL_TAG_COLORS[hash % SCHOOL_TAG_COLORS.length];
}
