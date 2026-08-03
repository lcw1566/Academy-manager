import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  addDaysYMD,
  formatDateShort,
  getKoreaMinutes,
  getKoreanWeekdayFromYMD,
  getMonthCalendarDatesFromYMD,
  getTodayYMD,
  getWeekDatesFromYMD,
  isSameMonth,
  nextMonth,
  prevMonth,
} from '../../utils/date';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function toMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatHour(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatTimeRange(schedule) {
  const start = String(schedule.startTime || schedule.time || '').slice(0, 5);
  const end = String(schedule.endTime || '').slice(0, 5);
  if (!start) return '시간 미정';
  return end ? `${start}–${end}` : start;
}

function scheduleTone(schedule) {
  if (schedule.tone) return schedule.tone;
  if (schedule.badge?.includes('보강') || schedule.sessionKind === 'makeup') {
    return {
      card: 'border-violet-200 bg-violet-50',
      title: 'text-violet-900',
      time: 'text-violet-600',
      dot: 'bg-violet-500',
    };
  }
  return {
    card: 'border-blue-200 bg-[#EDF5FF]',
    title: 'text-[#191F28]',
    time: 'text-[#0064FF]',
    dot: 'bg-[#3182F6]',
  };
}

// 같은 날짜에서 시간이 겹치는 일정은 동일한 세로 위치를 유지하고 좌우 칸만 나눈다.
function layoutOverlappingSchedules(schedules) {
  const timed = schedules
    .map((schedule, index) => {
      const start = toMinutes(schedule.startTime || schedule.time);
      const parsedEnd = toMinutes(schedule.endTime);
      if (start == null) return null;
      return {
        schedule,
        index,
        start,
        end: Math.max(start + 30, parsedEnd ?? start + 60),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const result = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const columnEnds = [];
    for (const item of cluster) {
      let column = columnEnds.findIndex((end) => end <= item.start);
      if (column < 0) column = columnEnds.length;
      columnEnds[column] = item.end;
      item.column = column;
    }
    const columnCount = Math.max(1, columnEnds.length);
    cluster.forEach((item) => result.push({ ...item, columnCount }));
    cluster = [];
  };

  for (const item of timed) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return result;
}

function getTimelineRange(dates, schedules) {
  const visible = schedules.filter((schedule) => dates.includes(schedule.date));
  const bounds = [];
  visible.forEach((schedule) => {
    const start = toMinutes(schedule.startTime || schedule.time);
    const end = toMinutes(schedule.endTime);
    if (start != null) bounds.push(start);
    if (end != null) bounds.push(end);
  });
  if (bounds.length === 0) return null;
  const startMin = Math.max(0, Math.floor((Math.min(...bounds) - 45) / 60) * 60);
  const endMin = Math.min(24 * 60, Math.ceil((Math.max(...bounds) + 45) / 60) * 60);
  const ticks = [];
  for (let value = startMin; value <= endMin; value += 60) ticks.push(value);
  return { startMin, endMin, ticks };
}

function isAllDaySchedule(schedule) {
  return schedule.allDay === true || toMinutes(schedule.startTime || schedule.time) == null;
}

function AllDayLane({ dates, schedules }) {
  const eventsByDate = useMemo(() => {
    const map = new Map();
    dates.forEach((date) => map.set(date, []));
    schedules.forEach((schedule) => {
      if (!map.has(schedule.date) || !isAllDaySchedule(schedule)) return;
      map.get(schedule.date).push(schedule);
    });
    return map;
  }, [dates, schedules]);
  const total = [...eventsByDate.values()].reduce((sum, items) => sum + items.length, 0);
  if (total === 0) return null;
  const gridColumns = `52px repeat(${dates.length}, minmax(0, 1fr))`;

  return (
    <div className="grid border-b border-[#F2F4F6] bg-white" style={{ gridTemplateColumns: gridColumns }}>
      <div className="px-2 py-2 text-[9px] font-extrabold text-[#8B95A1]">종일</div>
      {dates.map((date) => {
        const events = eventsByDate.get(date) || [];
        return (
          <div key={date} className="min-w-0 space-y-1 border-l border-[#F2F4F6] px-1 py-1.5">
            {events.slice(0, 2).map((schedule, index) => {
              const tone = scheduleTone(schedule);
              return (
                <button
                  key={schedule.id || index}
                  type="button"
                  onClick={schedule.onClick}
                  disabled={typeof schedule.onClick !== 'function'}
                  className={`block w-full truncate rounded-lg border px-1.5 py-1 text-left text-[9px] font-extrabold active:scale-[0.99] md:text-[10px] ${tone.card} ${tone.title}`}
                >
                  {schedule.title || '일정'}
                </button>
              );
            })}
            {events.length > 2 && (
              <p className="px-1 text-[8px] font-extrabold text-[#8B95A1]">+{events.length - 2}개</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimelineEvent({ item, range, pixelsPerMinute }) {
  const { schedule, start, end, column, columnCount } = item;
  const tone = scheduleTone(schedule);
  const top = (start - range.startMin) * pixelsPerMinute;
  const height = Math.max(18, (end - start) * pixelsPerMinute - 3);
  const width = 100 / columnCount;
  const interactive = typeof schedule.onClick === 'function';

  return (
    <button
      type="button"
      onClick={schedule.onClick}
      disabled={!interactive}
      title={`${schedule.title || '수업'} · ${formatTimeRange(schedule)}`}
      className={`absolute overflow-hidden rounded-xl border px-2 py-1.5 text-left shadow-sm transition enabled:active:scale-[0.99] ${tone.card}`}
      style={{
        top,
        height,
        left: `calc(${column * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        zIndex: 5 + column,
      }}
    >
      <p className={`truncate text-[10px] font-extrabold md:text-xs ${tone.title}`}>
        {schedule.title || '수업'}
      </p>
      {height >= 34 && (
        <p className={`mt-0.5 truncate text-[9px] font-bold md:text-[10px] ${tone.time}`}>
          {formatTimeRange(schedule)}
        </p>
      )}
      {height >= 58 && schedule.subtitle && (
        <p className="mt-1 truncate text-[9px] font-semibold text-[#6B7684] md:text-[10px]">
          {schedule.subtitle}
        </p>
      )}
      {height >= 78 && schedule.badge && (
        <span className="mt-1 inline-flex rounded-md bg-white/80 px-1.5 py-0.5 text-[8px] font-extrabold text-violet-600">
          {schedule.badge}
        </span>
      )}
    </button>
  );
}

function TimeGrid({
  dates, schedules, today, compact = false, showHeaders = true, emptyText,
  hasSupplementalEvents = false,
}) {
  const nowMinutes = getKoreaMinutes();
  const visibleSchedules = useMemo(
    () => schedules.filter((schedule) => dates.includes(schedule.date)),
    [dates, schedules],
  );
  const range = useMemo(
    () => getTimelineRange(dates, visibleSchedules),
    [dates, visibleSchedules],
  );
  const layoutsByDate = useMemo(() => {
    const map = new Map();
    dates.forEach((date) => {
      map.set(
        date,
        layoutOverlappingSchedules(visibleSchedules.filter((schedule) => schedule.date === date)),
      );
    });
    return map;
  }, [dates, visibleSchedules]);

  if (!range) {
    if (hasSupplementalEvents) return null;
    return (
      <div className="flex min-h-[150px] flex-col items-center justify-center px-4 py-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F2F7FF] text-[#3182F6]">
          <CalendarDays size={19} />
        </span>
        <p className="mt-3 text-sm font-bold text-[#4E5968]">{emptyText}</p>
      </div>
    );
  }

  const pixelsPerMinute = compact ? 0.68 : 0.82;
  const height = Math.max(compact ? 280 : 320, (range.endMin - range.startMin) * pixelsPerMinute);
  const gridColumns = `52px repeat(${dates.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden">
      {showHeaders && (
        <div className="grid border-b border-[#F2F4F6] bg-[#FBFCFD]" style={{ gridTemplateColumns: gridColumns }}>
          <div className="px-2 py-2.5 text-[10px] font-bold text-[#8B95A1]">시간</div>
          {dates.map((date) => (
            <div key={date} className="border-l border-[#F2F4F6] px-1 py-2 text-center">
              <p className={`text-[11px] font-extrabold ${date === today ? 'text-[#0064FF]' : 'text-[#333D4B]'}`}>
                {getKoreanWeekdayFromYMD(date)}
                <span className="ml-1 text-[9px] font-bold text-[#8B95A1]">{date.slice(5).replace('-', '.')}</span>
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: gridColumns }}>
        <div className="relative border-r border-[#F2F4F6] bg-[#FBFCFD]" style={{ height }}>
          {range.ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-2 -translate-y-1/2 text-[9px] font-semibold text-[#8B95A1]"
              style={{ top: (tick - range.startMin) * pixelsPerMinute }}
            >
              {formatHour(tick)}
            </span>
          ))}
        </div>
        {dates.map((date) => (
          <div
            key={date}
            className={`relative border-l border-[#F2F4F6] ${date === today ? 'bg-blue-50/30' : 'bg-white'}`}
            style={{ height }}
          >
            {range.ticks.map((tick) => (
              <span
                key={tick}
                className="absolute inset-x-0 border-t border-[#F2F4F6]"
                style={{ top: (tick - range.startMin) * pixelsPerMinute }}
              />
            ))}
            {date === today && nowMinutes >= range.startMin && nowMinutes <= range.endMin && (
              <span
                className="absolute inset-x-0 z-20 flex items-center"
                style={{ top: (nowMinutes - range.startMin) * pixelsPerMinute }}
                aria-label="현재 시간"
              >
                <span className="h-2 w-2 -translate-x-1 rounded-full bg-[#0064FF]" />
                <span className="h-0.5 flex-1 bg-[#0064FF]" />
              </span>
            )}
            {(layoutsByDate.get(date) || []).map((item) => (
              <TimelineEvent
                key={item.schedule.id || `${date}-${item.index}`}
                item={item}
                range={range}
                pixelsPerMinute={pixelsPerMinute}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthGrid({ dates, schedules, selectedDate, onSelectDate, anchorDate, today }) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-[#F2F4F6] bg-[#FBFCFD]">
        {DAY_LABELS.map((label, index) => (
          <div
            key={label}
            className={`px-1 py-2 text-center text-[10px] font-extrabold md:px-3 md:text-left ${
              index === 0 ? 'text-red-400' : index === 6 ? 'text-blue-400' : 'text-[#8B95A1]'
            }`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dates.map((date, index) => {
          if (!date) {
            return <div key={`blank-${index}`} className="min-h-[62px] border-b border-r border-[#F2F4F6] bg-[#FBFCFD] md:min-h-[118px]" />;
          }
          const daySchedules = schedules
            .filter((schedule) => schedule.date === date)
            .sort((left, right) => String(left.startTime || '').localeCompare(String(right.startTime || '')));
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const inMonth = isSameMonth(date, anchorDate);
          return (
            <div
              key={date}
              className={`min-h-[62px] border-b border-r border-[#F2F4F6] p-1 md:min-h-[118px] md:p-2 ${
                isSelected ? 'bg-[#F2F7FF]' : isToday ? 'bg-blue-50/30' : 'bg-white'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectDate(date)}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold md:h-8 md:w-8 md:text-xs ${
                  isSelected
                    ? 'bg-[#0064FF] text-white'
                    : isToday
                      ? 'bg-blue-50 text-[#0064FF]'
                      : inMonth ? 'text-[#333D4B]' : 'text-[#B0B8C1]'
                }`}
              >
                {Number(date.slice(8))}
              </button>
              <div className="mt-1 flex items-center gap-0.5 px-0.5 md:hidden">
                {daySchedules.slice(0, 3).map((schedule, scheduleIndex) => (
                  <span key={schedule.id || scheduleIndex} className={`h-1.5 flex-1 rounded-full ${scheduleTone(schedule).dot}`} />
                ))}
                {daySchedules.length > 3 && <span className="text-[7px] font-black text-[#8B95A1]">+</span>}
              </div>
              <div className="mt-1 hidden space-y-1 md:block">
                {daySchedules.slice(0, 3).map((schedule, scheduleIndex) => {
                  const tone = scheduleTone(schedule);
                  return (
                    <button
                      key={schedule.id || scheduleIndex}
                      type="button"
                      onClick={schedule.onClick}
                      disabled={typeof schedule.onClick !== 'function'}
                      className={`w-full truncate rounded-lg border px-1.5 py-1 text-left text-[9px] font-bold active:scale-[0.99] ${tone.card} ${tone.title}`}
                    >
                      <span className={tone.time}>{String(schedule.startTime || '').slice(0, 5)}</span>
                      {' '}{schedule.title || '수업'}
                    </button>
                  );
                })}
                {daySchedules.length > 3 && (
                  <button type="button" onClick={() => onSelectDate(date)} className="px-1 text-[9px] font-extrabold text-[#8B95A1]">
                    +{daySchedules.length - 3}개
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekDateStrip({ dates, schedules, selectedDate, onSelectDate, today }) {
  return (
    <div className="grid grid-cols-7 border-b border-[#F2F4F6] bg-[#FBFCFD] px-1 py-2 md:hidden">
      {dates.map((date) => {
        const count = schedules.filter((schedule) => schedule.date === date).length;
        const selected = date === selectedDate;
        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelectDate(date)}
            className="flex flex-col items-center gap-1"
          >
            <span className={`text-[9px] font-extrabold ${date === today ? 'text-[#0064FF]' : 'text-[#8B95A1]'}`}>
              {getKoreanWeekdayFromYMD(date)}
            </span>
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold ${
              selected ? 'bg-[#0064FF] text-white' : 'text-[#333D4B]'
            }`}>
              {Number(date.slice(8))}
            </span>
            <span className={`h-1.5 min-w-1.5 rounded-full ${count > 0 ? 'bg-[#3182F6]' : 'bg-transparent'}`} />
          </button>
        );
      })}
    </div>
  );
}

export default function ScheduleCalendar({
  selectedDate,
  onSelectDate,
  schedules = [],
  title = '수업 일정',
  emptyText = '수업 일정이 없어요',
  defaultMode = 'week',
  compact = false,
  onAddEvent,
  className = '',
}) {
  const today = getTodayYMD();
  const [internalSelectedDate, setInternalSelectedDate] = useState(selectedDate || today);
  const [anchorDate, setAnchorDate] = useState(selectedDate || today);
  const [mode, setMode] = useState(defaultMode);
  const activeDate = selectedDate || internalSelectedDate;
  const weekDates = useMemo(() => getWeekDatesFromYMD(anchorDate), [anchorDate]);
  const monthDates = useMemo(() => getMonthCalendarDatesFromYMD(anchorDate), [anchorDate]);
  const visibleDates = mode === 'week' ? weekDates : monthDates.filter(Boolean);
  const visibleCount = schedules.filter((schedule) => visibleDates.includes(schedule.date)).length;
  const selectedDaySchedules = schedules.filter((schedule) => schedule.date === activeDate);
  const periodLabel = mode === 'week'
    ? `${formatDateShort(weekDates[0])} – ${formatDateShort(weekDates[6])}`
    : `${anchorDate.slice(0, 4)}년 ${Number(anchorDate.slice(5, 7))}월`;

  useEffect(() => {
    if (!selectedDate) return;
    setInternalSelectedDate(selectedDate);
    setAnchorDate(selectedDate);
  }, [selectedDate]);

  const selectDate = (date) => {
    setInternalSelectedDate(date);
    setAnchorDate(date);
    onSelectDate?.(date);
  };

  const shift = (direction) => {
    if (mode === 'week') {
      selectDate(addDaysYMD(activeDate || anchorDate, direction * 7));
      return;
    }
    const shiftedMonth = direction > 0
      ? nextMonth(anchorDate.slice(0, 7))
      : prevMonth(anchorDate.slice(0, 7));
    selectDate(`${shiftedMonth}-01`);
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setAnchorDate(activeDate || today);
  };

  return (
    <section className={`mx-4 overflow-hidden rounded-3xl bg-white shadow-sm ${className}`}>
      <div className="border-b border-[#F2F4F6] px-4 py-4 md:flex md:items-center md:justify-between md:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-[#191F28]">{title}</h3>
            <span className="rounded-full bg-[#F2F4F6] px-2 py-0.5 text-[10px] font-extrabold text-[#6B7684]">
              {visibleCount}개
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] font-semibold text-[#8B95A1]">{periodLabel}</p>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 md:mt-0 md:justify-end">
          {onAddEvent && (
            <button
              type="button"
              onClick={() => onAddEvent(activeDate)}
              className="flex h-9 items-center gap-1 rounded-xl bg-[#0064FF] px-3 text-xs font-extrabold text-white shadow-sm active:bg-[#0050CC]"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">일정</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => selectDate(today)}
            className="h-9 rounded-xl bg-[#F2F4F6] px-3 text-xs font-extrabold text-[#4E5968] active:bg-[#E5E8EB]"
          >
            오늘
          </button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shift(-1)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F2F4F6] text-[#4E5968] active:bg-[#E5E8EB]" aria-label={mode === 'week' ? '이전 주' : '이전 달'}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => shift(1)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F2F4F6] text-[#4E5968] active:bg-[#E5E8EB]" aria-label={mode === 'week' ? '다음 주' : '다음 달'}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="flex rounded-xl bg-[#F2F4F6] p-1">
            {[
              { id: 'week', label: '주간' },
              { id: 'month', label: '월간' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => changeMode(item.id)}
                className={`h-8 rounded-lg px-3 text-xs font-extrabold transition-colors ${
                  mode === item.id
                    ? 'bg-white text-[#0064FF] shadow-sm'
                    : 'text-[#8B95A1]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'week' ? (
        <>
          <WeekDateStrip
            dates={weekDates}
            schedules={schedules}
            selectedDate={activeDate}
            onSelectDate={selectDate}
            today={today}
          />
          <div className="md:hidden">
            <div className="border-b border-[#F2F4F6] px-4 py-3">
              <p className="text-sm font-extrabold text-[#333D4B]">
                {activeDate === today ? '오늘' : formatDateShort(activeDate)}
              </p>
            </div>
            <AllDayLane dates={[activeDate]} schedules={schedules} />
            <TimeGrid
              dates={[activeDate]}
              schedules={schedules}
              today={today}
              compact={compact}
              showHeaders={false}
              emptyText={emptyText}
              hasSupplementalEvents={selectedDaySchedules.some(isAllDaySchedule)}
            />
          </div>
          <div className="hidden md:block">
            <AllDayLane dates={weekDates} schedules={schedules} />
            <TimeGrid
              dates={weekDates}
              schedules={schedules}
              today={today}
              compact={compact}
              emptyText={emptyText}
              hasSupplementalEvents={schedules.some((schedule) => (
                weekDates.includes(schedule.date) && isAllDaySchedule(schedule)
              ))}
            />
          </div>
        </>
      ) : (
        <>
          <MonthGrid
            dates={monthDates}
            schedules={schedules}
            selectedDate={activeDate}
            onSelectDate={selectDate}
            anchorDate={anchorDate}
            today={today}
          />
          <div className="border-t border-[#F2F4F6]">
            <div className="border-b border-[#F2F4F6] px-4 py-3">
              <p className="text-sm font-extrabold text-[#333D4B]">
                {activeDate === today ? '오늘' : formatDateShort(activeDate)} 일정
                <span className="ml-2 text-[11px] text-[#8B95A1]">{selectedDaySchedules.length}개</span>
              </p>
            </div>
            <AllDayLane dates={[activeDate]} schedules={schedules} />
            <TimeGrid
              dates={[activeDate]}
              schedules={schedules}
              today={today}
              compact
              showHeaders={false}
              emptyText={emptyText}
              hasSupplementalEvents={selectedDaySchedules.some(isAllDaySchedule)}
            />
          </div>
        </>
      )}
    </section>
  );
}
