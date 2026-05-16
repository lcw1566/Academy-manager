import { ArrowLeft } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import { formatDateShort } from '../../utils/date';
import { formatDays } from '../../utils/recurringClass';
import { attendanceStatusMap } from '../../utils/format';

export default function StudentLessonDetail({ student, group, standaloneClass, onBack }) {
  const { classes, lessonRecords, attendanceRecords } = useAcademyStore();

  let sessions = [];
  let title = '';
  let subtitle = '';

  if (group) {
    sessions = classes
      .filter((c) => c.repeatGroupId === group.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    title = `${student.name} ${group.subject} 과외`;
    subtitle = [
      `매주 ${formatDays(group.daysOfWeek)}요일`,
      group.startTime,
      group.location,
    ].filter(Boolean).join(' · ');
  } else if (standaloneClass) {
    sessions = [standaloneClass];
    title = standaloneClass.name || standaloneClass.subject || '단발 수업';
    subtitle = `${formatDateShort(standaloneClass.date)} · ${standaloneClass.startTime}`;
  }

  const getAttendance = (classId) =>
    attendanceRecords.find((a) => a.classId === classId && a.studentId === student.id);

  const getRecord = (classId) =>
    lessonRecords.find((lr) => lr.classId === classId && lr.studentId === student.id);

  const classIds = new Set(sessions.map((c) => c.id));
  const attList = attendanceRecords.filter(
    (a) => a.studentId === student.id && classIds.has(a.classId)
  );
  const present = attList.filter((a) => a.status === 'present').length;
  const late = attList.filter((a) => a.status === 'late').length;
  const absent = attList.filter((a) => a.status === 'absent').length;
  const makeup = attList.filter((a) => a.status === 'makeup').length;

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
            총 {sessions.length}회
          </span>
        </div>
      </div>

      {/* 회차별 기록 */}
      <p className="text-xs font-bold text-gray-400 px-1">회차별 기록</p>

      {sessions.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
          <p className="text-sm text-gray-400">수업 기록이 없어요</p>
        </div>
      ) : (
        sessions.map((cls) => {
          const att = getAttendance(cls.id);
          const rec = getRecord(cls.id);
          const attMeta = att ? attendanceStatusMap[att.status] : null;
          return (
            <div key={cls.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-gray-900">{formatDateShort(cls.date)}</p>
                  <p className="text-xs text-gray-400">
                    {cls.startTime}{cls.endTime ? ` - ${cls.endTime}` : ''}
                  </p>
                </div>
                {attMeta ? (
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
                <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-gray-50">
                  {rec.content && (
                    <p className="text-sm text-gray-700">{rec.content}</p>
                  )}
                  {rec.homework && (
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold text-gray-600">숙제</span>{' '}
                      {rec.homework}
                    </p>
                  )}
                  {rec.memo && (
                    <p className="text-xs text-gray-400">{rec.memo}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {rec.noticeStatus === 'sent' && (
                      <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        알림장 전송완료
                      </span>
                    )}
                    {rec.evaluation &&
                      Object.entries(rec.evaluation).map(([key, val]) => {
                        const colors = {
                          poor:  'bg-red-50 text-red-600',
                          fair:  'bg-orange-50 text-orange-600',
                          good:  'bg-blue-50 text-blue-600',
                          great: 'bg-green-50 text-green-600',
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
              ) : (
                <p className="text-xs text-gray-300 mt-2 pt-2 border-t border-gray-50">
                  수업 내용 미기록
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
