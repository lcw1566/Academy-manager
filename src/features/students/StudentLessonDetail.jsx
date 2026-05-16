import { useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAcademyStore from '../../store/useAcademyStore';
import { formatDateShort, today } from '../../utils/date';
import { formatDays } from '../../utils/recurringClass';
import { attendanceStatusMap } from '../../utils/format';

const RECENT_PAST_LIMIT = 5;
const UPCOMING_PREVIEW = 2;

function groupSessions(sessions, todayYMD) {
  const todaySessions   = sessions.filter((c) => c.date === todayYMD);
  const futureSorted    = sessions.filter((c) => c.date > todayYMD).sort((a, b) => a.date.localeCompare(b.date));
  const pastSorted      = sessions.filter((c) => c.date < todayYMD).sort((a, b) => b.date.localeCompare(a.date));

  const upcomingSessions  = futureSorted.slice(0, UPCOMING_PREVIEW);
  const farSessions       = futureSorted.slice(UPCOMING_PREVIEW);
  const recentSessions    = pastSorted.slice(0, RECENT_PAST_LIMIT);
  const olderSessions     = pastSorted.slice(RECENT_PAST_LIMIT);

  return { todaySessions, upcomingSessions, farSessions, recentSessions, olderSessions };
}

export default function StudentLessonDetail({ student, group, standaloneClass, onBack }) {
  const { classes, lessonRecords, attendanceRecords } = useAcademyStore();
  const [showFar, setShowFar] = useState(false);
  const [showOlder, setShowOlder] = useState(false);

  const todayYMD = today();

  let allSessions = [];
  let title = '';
  let subtitle = '';

  if (group) {
    allSessions = classes
      .filter((c) => c.repeatGroupId === group.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    title = `${student.name} ${group.subject} 과외`;
    subtitle = [
      `매주 ${formatDays(group.daysOfWeek)}요일`,
      group.startTime,
      group.location,
    ].filter(Boolean).join(' · ');
  } else if (standaloneClass) {
    allSessions = [standaloneClass];
    title = standaloneClass.name || standaloneClass.subject || '단발 수업';
    subtitle = `${formatDateShort(standaloneClass.date)} · ${standaloneClass.startTime}`;
  }

  const { todaySessions, upcomingSessions, farSessions, recentSessions, olderSessions } =
    groupSessions(allSessions, todayYMD);

  const getAttendance = (classId) =>
    attendanceRecords.find((a) => a.classId === classId && a.studentId === student.id);
  const getRecord = (classId) =>
    lessonRecords.find((lr) => lr.classId === classId && lr.studentId === student.id);

  const classIds = new Set(allSessions.map((c) => c.id));
  const attList = attendanceRecords.filter(
    (a) => a.studentId === student.id && classIds.has(a.classId)
  );
  const present = attList.filter((a) => a.status === 'present').length;
  const late    = attList.filter((a) => a.status === 'late').length;
  const absent  = attList.filter((a) => a.status === 'absent').length;
  const makeup  = attList.filter((a) => a.status === 'makeup').length;

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-blue-600 font-semibold text-sm py-1"
      >
        <ArrowLeft size={16} />
        수업 목록으로
      </button>

      {/* 수업 요약 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <p className="font-bold text-gray-900 mb-0.5">{title}</p>
        <p className="text-xs text-gray-500 mb-3">{subtitle}</p>
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium">
            출석 {present}회
          </span>
          {late > 0 && (
            <span className="text-xs bg-orange-50 text-orange-700 px-2.5 py-1 rounded-full font-medium">
              지각 {late}회
            </span>
          )}
          {absent > 0 && (
            <span className="text-xs bg-red-50 text-red-700 px-2.5 py-1 rounded-full font-medium">
              결석 {absent}회
            </span>
          )}
          {makeup > 0 && (
            <span className="text-xs bg-yellow-50 text-yellow-700 px-2.5 py-1 rounded-full font-medium">
              보강 {makeup}회
            </span>
          )}
          <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full font-medium">
            총 {allSessions.length}회
          </span>
        </div>
      </div>

      {/* 오늘 수업 */}
      {todaySessions.length > 0 && (
        <Section label="오늘 수업">
          {todaySessions.map((cls) => (
            <SessionCard key={cls.id} cls={cls} highlight getAttendance={getAttendance} getRecord={getRecord} />
          ))}
        </Section>
      )}

      {/* 다음 수업 */}
      {upcomingSessions.length > 0 && (
        <Section label="다음 수업">
          {upcomingSessions.map((cls) => (
            <SessionCard key={cls.id} cls={cls} upcoming getAttendance={getAttendance} getRecord={getRecord} />
          ))}
        </Section>
      )}

      {/* 최근 수업 기록 */}
      <Section label="최근 수업 기록">
        {recentSessions.length === 0 ? (
          <div className="bg-white rounded-2xl p-5 text-center shadow-sm">
            <p className="text-sm text-gray-400">아직 기록된 수업이 없어요</p>
          </div>
        ) : (
          recentSessions.map((cls) => (
            <SessionCard key={cls.id} cls={cls} getAttendance={getAttendance} getRecord={getRecord} />
          ))
        )}
      </Section>

      {/* 예정된 전체 수업 (접힘) */}
      {farSessions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowFar((v) => !v)}
            className="w-full flex items-center justify-between py-3 px-4 bg-white rounded-2xl shadow-sm text-sm font-semibold text-gray-600"
          >
            <span>예정된 전체 수업 ({farSessions.length}개)</span>
            <ChevronDown
              size={16}
              className={`text-gray-400 transition-transform ${showFar ? 'rotate-180' : ''}`}
            />
          </button>
          <AnimatePresence>
            {showFar && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2 mt-2">
                  {farSessions.map((cls) => (
                    <SessionCard key={cls.id} cls={cls} upcoming getAttendance={getAttendance} getRecord={getRecord} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 지난 전체 기록 (접힘) */}
      {olderSessions.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowOlder((v) => !v)}
            className="w-full flex items-center justify-between py-3 px-4 bg-white rounded-2xl shadow-sm text-sm font-semibold text-gray-600"
          >
            <span>지난 기록 더 보기 ({olderSessions.length}개)</span>
            <ChevronDown
              size={16}
              className={`text-gray-400 transition-transform ${showOlder ? 'rotate-180' : ''}`}
            />
          </button>
          <AnimatePresence>
            {showOlder && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-2 mt-2">
                  {olderSessions.map((cls) => (
                    <SessionCard key={cls.id} cls={cls} getAttendance={getAttendance} getRecord={getRecord} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-400 mb-2 px-1">{label}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function SessionCard({ cls, getAttendance, getRecord, highlight = false, upcoming = false }) {
  const att = getAttendance(cls.id);
  const rec = getRecord(cls.id);
  const attMeta = att ? attendanceStatusMap[att.status] : null;

  return (
    <div className={`rounded-2xl p-4 shadow-sm ${
      highlight ? 'bg-blue-50 border border-blue-200' :
      upcoming  ? 'bg-white border border-gray-100' :
      'bg-white'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className={`text-sm font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>
            {formatDateShort(cls.date)}
            {highlight && <span className="ml-1.5 text-xs font-normal text-blue-500">오늘</span>}
          </p>
          <p className="text-xs text-gray-400">
            {cls.startTime}{cls.endTime ? ` - ${cls.endTime}` : ''}
          </p>
        </div>
        {upcoming && !att ? (
          <span className="text-xs text-gray-300 px-2.5 py-1 rounded-full bg-gray-50 font-medium">
            예정
          </span>
        ) : attMeta ? (
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${attMeta.bg} ${attMeta.color}`}>
            {attMeta.label}
          </span>
        ) : (
          <span className="text-xs text-gray-300 px-2.5 py-1 rounded-full bg-gray-50">
            출결 미기록
          </span>
        )}
      </div>

      {rec ? (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-100">
          {rec.content && <p className="text-sm text-gray-700">{rec.content}</p>}
          {rec.homework && (
            <p className="text-xs text-gray-500">
              <span className="font-semibold text-gray-600">숙제</span> {rec.homework}
            </p>
          )}
          {rec.memo && <p className="text-xs text-gray-400">{rec.memo}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            {rec.noticeStatus === 'sent' && (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                알림장 전송완료
              </span>
            )}
            {rec.evaluation &&
              Object.entries(rec.evaluation).map(([key, val]) => {
                const colors = {
                  poor: 'bg-red-50 text-red-600', fair: 'bg-orange-50 text-orange-600',
                  good: 'bg-blue-50 text-blue-600', great: 'bg-green-50 text-green-600',
                };
                const labels = {
                  focus: '집중', attitude: '태도',
                  understanding: '이해', homework: '숙제', achievement: '성취',
                };
                return (
                  <span key={key} className={`text-xs px-2 py-0.5 rounded-full ${colors[val]}`}>
                    {labels[key]}
                  </span>
                );
              })}
          </div>
        </div>
      ) : !upcoming ? (
        <p className="text-xs text-gray-300 pt-2 border-t border-gray-100">수업 내용 미기록</p>
      ) : null}
    </div>
  );
}
