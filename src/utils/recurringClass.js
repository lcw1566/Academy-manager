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

/** 선택된 요일 배열을 "월, 목" 형태 문자열로 변환 */
export const formatDays = (daysOfWeek) =>
  daysOfWeek
    .slice()
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((d) => DAY_NAMES[d])
    .join(', ');

/** YYYY-MM-DD 문자열을 timezone-safe하게 생성 */
const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 날짜의 주 첫날(월요일) 구하기 */
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
  const start = new Date(startDate + 'T00:00:00');

  let end;
  if (endDate) {
    end = new Date(endDate + 'T00:00:00');
  } else {
    end = new Date(start);
    end.setMonth(end.getMonth() + 3);
  }

  const startMonday = getMonday(start);
  const current = new Date(start);

  while (current <= end) {
    const dow = current.getDay();

    if (daysOfWeek.includes(dow)) {
      if (repeatType === '매주') {
        dates.push(toDateStr(current));
      } else if (repeatType === '격주') {
        const currentMonday = getMonday(current);
        const weekDiff = Math.round((currentMonday - startMonday) / (7 * 24 * 60 * 60 * 1000));
        if (weekDiff % 2 === 0) dates.push(toDateStr(current));
      } else if (repeatType === '매월') {
        // 매월: 해당 요일의 첫 번째 주만 포함
        const firstOccurrence = getFirstWeekdayOfMonth(current.getFullYear(), current.getMonth(), dow);
        if (current.getDate() === firstOccurrence) dates.push(toDateStr(current));
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
