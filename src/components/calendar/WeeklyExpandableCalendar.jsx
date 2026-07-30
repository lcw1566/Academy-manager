import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getTodayYMD,
  getWeekDatesFromYMD,
  getMonthCalendarDatesFromYMD,
  getKoreanWeekdayIndex,
  addDaysYMD,
  isSameMonth,
  nextMonth,
  prevMonth,
} from '../../utils/date';

// schedules: [{ date: 'YYYY-MM-DD', type: 'class'|'consultation'|'payment'|'exam'|'performance'|'school' }]
const DOT_COLORS = {
  class:        'bg-blue-500',
  consultation: 'bg-purple-500',
  payment:      'bg-orange-400',
  exam:         'bg-amber-500',
  performance:  'bg-green-500',
  school:       'bg-gray-400',
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const TYPE_LABELS = {
  class: '수업',
  consultation: '상담',
  payment: '수납',
  exam: '시험',
  performance: '기록',
  school: '학교',
};

export default function WeeklyExpandableCalendar({
  selectedDate,
  onSelectDate,
  schedules = [],
  showAgenda = false,
  emptyAgendaText = '등록된 일정이 없어요',
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [pivotDate, setPivotDate] = useState(getTodayYMD());

  const todayStr = getTodayYMD();
  const weekDates  = getWeekDatesFromYMD(pivotDate);
  const monthDates = getMonthCalendarDatesFromYMD(pivotDate);
  const displayedDates = isExpanded ? monthDates : weekDates;

  const [pivotYear, pivotMonth] = pivotDate.split('-').map(Number);
  const monthLabel = `${pivotYear}년 ${pivotMonth}월`;

  const scheduleTypesByDate = useMemo(() => {
    const map = new Map();
    for (const schedule of schedules) {
      if (!schedule?.date || !schedule?.type) continue;
      const types = map.get(schedule.date) || [];
      if (!types.includes(schedule.type) && types.length < 3) {
        types.push(schedule.type);
      }
      map.set(schedule.date, types);
    }
    return map;
  }, [schedules]);
  const selectedSchedules = useMemo(
    () => schedules
      .filter((schedule) => schedule?.date === selectedDate)
      .sort((a, b) => String(a.time || a.startTime || '').localeCompare(
        String(b.time || b.startTime || ''),
      )),
    [schedules, selectedDate],
  );

  // 부모의 "오늘" 이동처럼 선택 날짜가 외부에서 바뀌어도 해당 주/월이 보이게 한다.
  useEffect(() => {
    if (selectedDate) setPivotDate(selectedDate);
  }, [selectedDate]);

  const shift = (delta) => {
    if (isExpanded) {
      const shiftedMonth = delta > 0
        ? nextMonth(pivotDate.slice(0, 7))
        : prevMonth(pivotDate.slice(0, 7));
      const nextDate = `${shiftedMonth}-01`;
      setPivotDate(nextDate);
      onSelectDate(nextDate);
    } else {
      const nextDate = addDaysYMD(selectedDate || pivotDate, delta * 7);
      setPivotDate(nextDate);
      onSelectDate(nextDate);
    }
  };

  const dotsForDate = (dateStr) => {
    if (!dateStr) return [];
    return scheduleTypesByDate.get(dateStr) || [];
  };

  const handleToggle = () => {
    if (isExpanded && selectedDate) {
      setPivotDate(selectedDate);
    }
    setIsExpanded((v) => !v);
  };

  const handleSelect = (dateStr) => {
    if (!dateStr) return;
    onSelectDate(dateStr);
    if (!isExpanded) setPivotDate(dateStr);
  };

  return (
    <div className="mx-4 bg-white rounded-3xl shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button type="button" onClick={() => shift(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100 active:scale-95 transition-transform">
          <ChevronLeft size={18} className="text-gray-500" />
        </button>
        <span className="text-sm font-bold text-gray-900">{monthLabel}</span>
        <button type="button" onClick={() => shift(1)}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100 active:scale-95 transition-transform">
          <ChevronRight size={18} className="text-gray-500" />
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 px-2 mb-1">
        {DAY_LABELS.map((d, i) => (
          <div key={d} className={`text-center text-[11px] font-semibold py-1 ${
            i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'
          }`}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 — layout 애니메이션 없이 transform/opacity만 사용 */}
      <div className="px-2">
        <div className="grid grid-cols-7">
          {displayedDates.map((dateStr, i) => {
            if (!dateStr) return <div key={`empty-${i}`} className="h-11" />;

            const dow = getKoreanWeekdayIndex(dateStr);
            const isSelected  = dateStr === selectedDate;
            const isToday     = dateStr === todayStr;
            const inThisMonth = isSameMonth(dateStr, pivotDate);
            const dots        = dotsForDate(dateStr);

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => handleSelect(dateStr)}
                className="flex flex-col items-center py-1 active:scale-95 transition-transform"
              >
                <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white font-bold'
                    : isToday
                    ? 'bg-blue-50 text-blue-600 font-bold'
                    : !inThisMonth
                    ? 'text-gray-300'
                    : dow === 0
                    ? 'text-red-400'
                    : dow === 6
                    ? 'text-blue-400'
                    : 'text-gray-800'
                }`}>
                  {Number(dateStr.slice(8))}
                </div>
                <div className="flex gap-0.5 mt-0.5 h-1.5">
                  {dots.map((type, j) => (
                    <div key={j} className={`w-1 h-1 rounded-full ${DOT_COLORS[type] || 'bg-gray-300'}`} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {showAgenda && (
        <div className="mx-3 mt-2 border-t border-[#F2F4F6] px-1 pb-2 pt-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-extrabold text-[#333D4B]">
              {selectedDate === todayStr ? '오늘 일정' : `${Number(selectedDate?.slice(5, 7)) || ''}월 ${Number(selectedDate?.slice(8, 10)) || ''}일 일정`}
            </p>
            {selectedSchedules.length > 0 && (
              <span className="text-[11px] font-bold text-[#8B95A1]">
                {selectedSchedules.length}개
              </span>
            )}
          </div>
          {selectedSchedules.length === 0 ? (
            <div className="rounded-xl bg-[#F8F9FA] px-3 py-3 text-center text-xs font-medium text-[#8B95A1]">
              {emptyAgendaText}
            </div>
          ) : (
            <div className="space-y-1.5">
              {selectedSchedules.slice(0, 4).map((schedule, index) => {
                const time = schedule.time
                  || [schedule.startTime, schedule.endTime].filter(Boolean).join('–');
                const interactive = typeof schedule.onClick === 'function';
                return (
                  <button
                    key={schedule.id || `${schedule.date}-${time}-${schedule.title || index}`}
                    type="button"
                    onClick={schedule.onClick}
                    disabled={!interactive}
                    className="flex w-full items-center gap-3 rounded-xl bg-[#F8F9FA] px-3 py-2.5 text-left enabled:active:scale-[0.99] enabled:active:bg-[#F2F4F6]"
                  >
                    <span className={`h-8 w-1 flex-shrink-0 rounded-full ${DOT_COLORS[schedule.type] || 'bg-gray-300'}`} />
                    <span className="w-[76px] flex-shrink-0 text-xs font-extrabold text-[#333D4B]">
                      {time || TYPE_LABELS[schedule.type] || '일정'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#191F28]">
                        {schedule.title || TYPE_LABELS[schedule.type] || '일정'}
                      </span>
                      {schedule.subtitle && (
                        <span className="mt-0.5 block truncate text-[11px] font-medium text-[#8B95A1]">
                          {schedule.subtitle}
                        </span>
                      )}
                    </span>
                    {schedule.badge && (
                      <span className="flex-shrink-0 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600">
                        {schedule.badge}
                      </span>
                    )}
                  </button>
                );
              })}
              {selectedSchedules.length > 4 && (
                <p className="px-2 py-1 text-center text-[11px] font-bold text-[#8B95A1]">
                  일정 {selectedSchedules.length - 4}개 더 있어요
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 펼치기/접기 버튼 */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-center gap-1 py-2.5 mt-1 border-t border-gray-50 text-xs text-gray-400 font-medium active:scale-[0.99] transition-transform"
      >
        {isExpanded
          ? <><ChevronUp size={13} /> 접기</>
          : <><ChevronDown size={13} /> 펼치기</>
        }
      </button>
    </div>
  );
}
