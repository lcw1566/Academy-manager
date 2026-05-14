import { parseYMD, formatDateToYMD } from './date';

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

const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
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
  const start = parseYMD(startDate);

  let end;
  if (endDate) {
    end = parseYMD(endDate);
  } else {
    end = new Date(start.getFullYear(), start.getMonth() + 3, start.getDate());
  }

  const startMonday = getMonday(start);
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  while (current <= end) {
    const dow = current.getDay();

    if (daysOfWeek.includes(dow)) {
      if (repeatType === '매주') {
        dates.push(formatDateToYMD(current));
      } else if (repeatType === '격주') {
        const currentMonday = getMonday(current);
        const weekDiff = Math.round((currentMonday - startMonday) / (7 * 24 * 60 * 60 * 1000));
        if (weekDiff % 2 === 0) dates.push(formatDateToYMD(current));
      } else if (repeatType === '매월') {
        const firstOccurrence = getFirstWeekdayOfMonth(current.getFullYear(), current.getMonth(), dow);
        if (current.getDate() === firstOccurrence) dates.push(formatDateToYMD(current));
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function getFirstWeekdayOfMonth(year, month, weekday) {
  const firstDay = new Date(year, month, 1);
  const firstDow = firstDay.getDay();
  let diff = weekday - firstDow;
  if (diff < 0) diff += 7;
  return 1 + diff;
}
