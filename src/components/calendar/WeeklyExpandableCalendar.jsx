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

export default function WeeklyExpandableCalendar({ selectedDate, onSelectDate, schedules = [] }) {
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

  // 부모의 "오늘" 이동처럼 선택 날짜가 외부에서 바뀌어도 해당 주/월이 보이게 한다.
  useEffect(() => {
    if (selectedDate) setPivotDate(selectedDate);
  }, [selectedDate]);

  const shift = (delta) => {
    if (isExpanded) {
      const shiftedMonth = delta > 0
        ? nextMonth(pivotDate.slice(0, 7))
        : prevMonth(pivotDate.slice(0, 7));
      setPivotDate(`${shiftedMonth}-01`);
    } else {
      setPivotDate(addDaysYMD(pivotDate, delta * 7));
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
