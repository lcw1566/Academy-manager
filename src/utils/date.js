// 학원 운영 날짜의 단일 기준은 한국 시간(Asia/Seoul)이다.
// 서버 timestamp는 ISO(UTC)로 저장하되, 날짜·요일·오늘·월 경계 판단은 모두
// 아래 유틸을 거쳐 한국 날짜로 계산한다.

export const ACADEMY_TIME_ZONE = 'Asia/Seoul';

const koreaDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ACADEMY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function getKoreaDateTimeParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = {};
  for (const part of koreaDateTimeFormatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function parseYMDParts(ymd) {
  const match = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatYMDParts(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// Date 객체가 꼭 필요한 기존 캘린더 호환용. 정오 UTC를 사용하면 한국·UTC 및
// 대부분의 브라우저 시간대에서 날짜가 전날로 밀리지 않는다.
export function parseYMD(ymd) {
  const parts = parseYMDParts(ymd);
  if (!parts) return new Date(Number.NaN);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
}

// Date는 특정 순간이므로 한국에서 보이는 날짜로 변환한다.
export function formatDateToYMD(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = getKoreaDateTimeParts(value);
  return parts ? formatYMDParts(parts.year, parts.month, parts.day) : '';
}

export function getTodayYMD() {
  return formatDateToYMD(new Date());
}

export function getKoreaHHMM(value = new Date()) {
  const parts = getKoreaDateTimeParts(value);
  return parts ? `${pad2(parts.hour)}:${pad2(parts.minute)}` : '';
}

export function getKoreaMinutes(value = new Date()) {
  const parts = getKoreaDateTimeParts(value);
  return parts ? parts.hour * 60 + parts.minute : 0;
}

export function addDaysYMD(ymd, days) {
  const parts = parseYMDParts(ymd);
  if (!parts) return '';
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + Number(days || 0)));
  return formatYMDParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function getKoreanWeekdayIndex(ymd) {
  const parts = parseYMDParts(ymd);
  if (!parts) return -1;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function getDaysInMonth(yearOrMonth, maybeMonth) {
  let year = Number(yearOrMonth);
  let month = Number(maybeMonth);
  if (maybeMonth === undefined) {
    const parts = String(yearOrMonth || '').split('-').map(Number);
    [year, month] = parts;
  }
  if (!year || !month) return 0;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getWeekDatesFromYMD(selectedYMD) {
  const weekday = getKoreanWeekdayIndex(selectedYMD);
  if (weekday < 0) return [];
  const sunday = addDaysYMD(selectedYMD, -weekday);
  return Array.from({ length: 7 }, (_, index) => addDaysYMD(sunday, index));
}

export function getMonthCalendarDatesFromYMD(selectedYMD) {
  const parts = parseYMDParts(selectedYMD);
  if (!parts) return [];
  const firstYMD = formatYMDParts(parts.year, parts.month, 1);
  const result = Array(getKoreanWeekdayIndex(firstYMD)).fill(null);
  const lastDay = getDaysInMonth(parts.year, parts.month);
  for (let day = 1; day <= lastDay; day += 1) {
    result.push(formatYMDParts(parts.year, parts.month, day));
  }
  while (result.length % 7 !== 0) result.push(null);
  return result;
}

export function isSameYMD(a, b) {
  return a === b;
}

export function getKoreanWeekdayFromYMD(ymd) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[getKoreanWeekdayIndex(ymd)] || '';
}

// ── Aliases & legacy helpers ───────────────────────────────────────────────

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

export const getCurrentMonth = () => getTodayYMD().slice(0, 7);

export const formatMonth = (monthStr) => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  return `${year}년 ${parseInt(month, 10)}월`;
};

function shiftMonth(monthStr, delta) {
  const [year, month] = String(monthStr || '').split('-').map(Number);
  if (!year || !month) return '';
  const zeroBased = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return `${nextYear}-${pad2(nextMonth)}`;
}

export const prevMonth = (monthStr) => shiftMonth(monthStr, -1);

export const nextMonth = (monthStr) => shiftMonth(monthStr, 1);

export const getYearMonthFromYMD = (ymd) => {
  if (!ymd) return '';
  return ymd.slice(0, 7);
};

export const getMonthsBetween = (startMonth, endMonth) => {
  const result = [];
  let current = startMonth;
  while (current && current <= endMonth) {
    result.push(current);
    current = nextMonth(current);
  }
  return result;
};

export const formatDate = (dateStr) => {
  const parts = parseYMDParts(dateStr);
  if (!parts) return '';
  return `${parts.year}.${pad2(parts.month)}.${pad2(parts.day)} (${getKoreanWeekdayFromYMD(dateStr)})`;
};

export const formatDateShort = (dateStr) => {
  const parts = parseYMDParts(dateStr);
  if (!parts) return '';
  return `${parts.month}월 ${parts.day}일 (${getKoreanWeekdayFromYMD(dateStr)})`;
};

export const formatDateKo = (dateStr) => {
  const parts = parseYMDParts(dateStr);
  if (!parts) return '';
  return `${parts.year}년 ${parts.month}월 ${parts.day}일`;
};

export const greetingByTime = () => {
  const hour = getKoreaDateTimeParts()?.hour ?? 12;
  if (hour < 12) return '좋은 아침이에요';
  if (hour < 18) return '안녕하세요';
  return '수고하셨어요';
};

// diff: 음수=과거, 0=오늘, 양수=미래
export const getDDay = (ymd) => {
  const todayParts = parseYMDParts(getTodayYMD());
  const eventParts = parseYMDParts(ymd);
  if (!todayParts || !eventParts) return null;
  const todayMs = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
  const eventMs = Date.UTC(eventParts.year, eventParts.month - 1, eventParts.day);
  return Math.round((eventMs - todayMs) / 86400000);
};

export const getDDayLabel = (ymd) => {
  const diff = getDDay(ymd);
  if (diff === null) return '';
  if (diff === 0) return 'D-Day';
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
};

export const isPastDate = (ymd) => {
  if (!ymd) return false;
  return getDDay(ymd) < 0;
};

export const compareYMD = (a, b) => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

export const sortByDateAsc = (items, key = 'date') => (
  [...items].sort((a, b) => compareYMD(a[key], b[key]))
);
export const sortByDateDesc = (items, key = 'date') => (
  [...items].sort((a, b) => compareYMD(b[key], a[key]))
);

export const getCurrentYearMonth = getCurrentMonth;
