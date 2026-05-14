import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { today, getWeekDates, getMonthDates, isSameMonth } from '../../utils/date';

// schedules: [{ date: 'YYYY-MM-DD', type: 'class'|'consultation'|'payment' }]
const DOT_COLORS = {
  class:        'bg-blue-500',
  consultation: 'bg-purple-500',
  payment:      'bg-orange-400',
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export default function WeeklyExpandableCalendar({ selectedDate, onSelectDate, schedules = [] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [pivotDate, setPivotDate] = useState(today());

  const todayStr = today();
  const weekDates  = getWeekDates(pivotDate);
  const monthDates = getMonthDates(pivotDate);
  const displayedDates = isExpanded ? monthDates : weekDates;

  const pivot = new Date(pivotDate + 'T00:00:00');
  const monthLabel = `${pivot.getFullYear()}년 ${pivot.getMonth() + 1}월`;

  const shift = (delta) => {
    const d = new Date(pivotDate + 'T00:00:00');
    if (isExpanded) d.setMonth(d.getMonth() + delta);
    else            d.setDate(d.getDate() + delta * 7);
    setPivotDate(d.toISOString().split('T')[0]);
  };

  const dotsForDate = (dateStr) => {
    if (!dateStr) return [];
    const types = [...new Set(
      schedules.filter((s) => s.date === dateStr).map((s) => s.type)
    )];
    return types.slice(0, 3);
  };

  // 월간 전환 시 pivotDate를 선택 날짜가 속한 주로 맞춤
  const handleToggle = () => {
    if (isExpanded && selectedDate) {
      setPivotDate(selectedDate);
    }
    setIsExpanded((v) => !v);
  };

  // 주간에서 selectedDate가 속한 주 주간으로 자동 이동
  const handleSelect = (dateStr) => {
    if (!dateStr) return;
    onSelectDate(dateStr);
    if (!isExpanded) setPivotDate(dateStr);
  };

  return (
    <div className="mx-4 bg-white rounded-3xl shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <motion.button whileTap={{ scale: 0.85 }} onClick={() => shift(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
          <ChevronLeft size={18} className="text-gray-500" />
        </motion.button>
        <span className="text-sm font-bold text-gray-900">{monthLabel}</span>
        <motion.button whileTap={{ scale: 0.85 }} onClick={() => shift(1)}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100">
          <ChevronRight size={18} className="text-gray-500" />
        </motion.button>
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

      {/* 날짜 그리드 */}
      <motion.div
        layout
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="px-2"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={isExpanded ? `month-${pivotDate.slice(0, 7)}` : `week-${weekDates[0]}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-7"
          >
            {displayedDates.map((dateStr, i) => {
              if (!dateStr) return <div key={`empty-${i}`} className="h-11" />;

              const d = new Date(dateStr + 'T00:00:00');
              const dow = d.getDay();
              const isSelected  = dateStr === selectedDate;
              const isToday     = dateStr === todayStr;
              const inThisMonth = isSameMonth(dateStr, pivotDate);
              const dots        = dotsForDate(dateStr);

              return (
                <motion.button
                  key={dateStr}
                  whileTap={{ scale: 0.85 }}
                  onClick={() => handleSelect(dateStr)}
                  className="flex flex-col items-center py-1"
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
                    {d.getDate()}
                  </div>
                  <div className="flex gap-0.5 mt-0.5 h-1.5">
                    {dots.map((type, j) => (
                      <div key={j} className={`w-1 h-1 rounded-full ${DOT_COLORS[type] || 'bg-gray-300'}`} />
                    ))}
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* 펼치기/접기 버튼 */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleToggle}
        className="w-full flex items-center justify-center gap-1 py-2.5 mt-1 border-t border-gray-50 text-xs text-gray-400 font-medium"
      >
        {isExpanded
          ? <><ChevronUp size={13} /> 접기</>
          : <><ChevronDown size={13} /> 펼치기</>
        }
      </motion.button>
    </div>
  );
}
