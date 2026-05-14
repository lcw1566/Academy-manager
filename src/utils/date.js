// All date operations use local time to avoid UTC/timezone issues

export function parseYMD(ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateToYMD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayYMD() {
  return formatDateToYMD(new Date());
}

export function addDaysYMD(ymd, days) {
  const d = parseYMD(ymd);
  d.setDate(d.getDate() + days);
  return formatDateToYMD(d);
}

export function getWeekDatesFromYMD(selectedYMD) {
  const d = parseYMD(selectedYMD);
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + i);
    return formatDateToYMD(day);
  });
}

export function getMonthCalendarDatesFromYMD(selectedYMD) {
  const d = parseYMD(selectedYMD);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const result = Array(firstDay.getDay()).fill(null);
  for (let i = 1; i <= lastDay.getDate(); i++) {
    result.push(formatDateToYMD(new Date(year, month, i)));
  }
  while (result.length % 7 !== 0) result.push(null);
  return result;
}

export function isSameYMD(a, b) {
  return a === b;
}

export function getKoreanWeekdayFromYMD(ymd) {
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  return DAYS[parseYMD(ymd).getDay()];
}

// ── Aliases & legacy helpers ──────────────────────────────────────────────────

export const today = getTodayYMD;

export const todayPlus = (days) => addDaysYMD(getTodayYMD(), days);

export const getWeekDates = getWeekDatesFromYMD;

export const getMonthDates = getMonthCalendarDatesFromYMD;

export const isSameMonth = (dateStr, pivotStr) => {
  if (!dateStr || !pivotStr) return false;
  return dateStr.slice(0, 7) === pivotStr.slice(0, 7);
};

export const isToday = (dateStr) => dateStr === getTodayYMD();

export const isThisWeek = (dateStr) => getWeekDatesFromYMD(getTodayYMD()).includes(dateStr);

export const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const formatMonth = (monthStr) => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  return `${year}년 ${parseInt(month)}월`;
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = parseYMD(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`;
};

export const formatDateShort = (dateStr) => {
  if (!dateStr) return '';
  const d = parseYMD(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
};

export const formatDateKo = (dateStr) => {
  if (!dateStr) return '';
  const d = parseYMD(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};

export const greetingByTime = () => {
  const hour = new Date().getHours();
  if (hour < 12) return '좋은 아침이에요';
  if (hour < 18) return '안녕하세요';
  return '수고하셨어요';
};
