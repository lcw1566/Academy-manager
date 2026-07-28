import {
  addDaysYMD,
  getDaysInMonth,
  getKoreanWeekdayIndex,
  nextMonth,
  parseYMD,
} from './date';

export const DAY_OPTIONS = [
  { id: 1, label: '월' },
  { id: 2, label: '화' },
  { id: 3, label: '수' },
  { id: 4, label: '목' },
  { id: 5, label: '금' },
  { id: 6, label: '토' },
  { id: 0, label: '일' },
];

export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export const formatDays = (daysOfWeek) =>
  daysOfWeek
    .slice()
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((d) => DAY_NAMES[d])
    .join(', ');

const getMondayYMD = (ymd) => {
  const day = getKoreanWeekdayIndex(ymd);
  if (day < 0) return '';
  return addDaysYMD(ymd, day === 0 ? -6 : 1 - day);
};

const diffWeeks = (fromMondayYMD, toMondayYMD) => {
  const from = parseYMD(fromMondayYMD);
  const to = parseYMD(toMondayYMD);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return -1;
  return Math.round((to.getTime() - from.getTime()) / (7 * 24 * 60 * 60 * 1000));
};

const addMonthsClamped = (ymd, count) => {
  const [, , rawDay] = String(ymd).split('-').map(Number);
  let month = ymd.slice(0, 7);
  for (let index = 0; index < count; index += 1) month = nextMonth(month);
  const day = Math.min(rawDay, getDaysInMonth(month));
  return `${month}-${String(day).padStart(2, '0')}`;
};

/**
 * 반복 수업 날짜 목록 생성
 * @param {Object} params
 * @param {number[]} params.daysOfWeek  - 요일 배열 (0=일, 1=월 ... 6=토)
 * @param {string}  params.startDate   - 'YYYY-MM-DD'
 * @param {string|null} params.endDate - 'YYYY-MM-DD' or null (null → 3개월)
 * @param {string}  params.repeatType  - '매주' | '격주' | '매월'
 * @returns {string[]} 날짜 문자열 배열
 */
export function generateClassDates({ daysOfWeek, startDate, endDate, repeatType }) {
  const dates = [];
  if (Number.isNaN(parseYMD(startDate).getTime())) return dates;
  const finalDate = endDate || addMonthsClamped(startDate, 3);
  const startMonday = getMondayYMD(startDate);
  let current = startDate;

  while (current <= finalDate) {
    const dow = getKoreanWeekdayIndex(current);

    if (daysOfWeek.includes(dow)) {
      if (repeatType === '매주') {
        dates.push(current);
      } else if (repeatType === '격주') {
        const weekDiff = diffWeeks(startMonday, getMondayYMD(current));
        if (weekDiff >= 0 && weekDiff % 2 === 0) dates.push(current);
      } else if (repeatType === '매월') {
        const dayOfMonth = Number(current.slice(8, 10));
        if (dayOfMonth <= 7) dates.push(current);
      }
    }

    current = addDaysYMD(current, 1);
    if (!current) break;
  }

  return dates;
}
