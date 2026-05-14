import { useState } from 'react';
import { Edit2, Phone, Trash2 } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import Header from '../../components/Header';
import EmptyState from '../../components/EmptyState';
import StudentFormModal from './StudentFormModal';
import ClassFormModal from '../classes/ClassFormModal';
import { formatCurrency, attendanceStatusMap, paymentStatusMap } from '../../utils/format';
import { formatDateShort, getCurrentMonth, today } from '../../utils/date';
import { formatDays } from '../../utils/recurringClass';

const TABS = [
  { id: 'info',       label: '기본' },
  { id: 'schedule',   label: '정기 과외' },
  { id: 'records',    label: '수업기록' },
  { id: 'attendance', label: '출결' },
  { id: 'payments',   label: '수납' },
];

export default function StudentDetailPage() {
  const {
    selectedStudentId, students, classes,
    lessonRecords, attendanceRecords, payments, repeatGroups,
    deleteRepeatGroupFuture,
    goBackFromStudent, navigateToClass, deleteStudent,
  } = useAcademyStore();

  const student = students.find((s) => s.id === selectedStudentId);
  const [tab, setTab] = useState('info');
  const [showEdit, setShowEdit] = useState(false);
  const [showClassForm, setShowClassForm] = useState(false);

  if (!student) return null;

  const handleDelete = () => {
    if (window.confirm(`${student.name} 학생을 삭제할까요?\n수업 기록, 출결, 수납 데이터는 유지됩니다.`)) {
      goBackFromStudent();
      deleteStudent(student.id);
    }
  };

  const currentMonth = getCurrentMonth();
  const todayStr = today();

  // Support both old (studentId) and new (studentIds) repeat group structure
  const studentGroups = repeatGroups.filter((g) =>
    g.studentIds?.includes(student.id) || g.studentId === student.id
  );

  const studentClasses = classes
    .filter((c) => c.studentIds.includes(student.id))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

  const studentRecords = lessonRecords
    .filter((lr) => lr.studentId === student.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const studentAttendance = attendanceRecords
    .filter((a) => a.studentId === student.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const studentPayments = payments
    .filter((p) => p.studentId === student.id)
    .sort((a, b) => b.month.localeCompare(a.month));

  const thisMonthPayment = studentPayments.find((p) => p.month === currentMonth);

  const schoolLabel = [student.schoolName || student.school, student.grade].filter(Boolean).join(' ');

  return (
    <div>
      <Header
        title={student.name}
        onBack={goBackFromStudent}
        right={
          <button onClick={() => setShowEdit(true)}>
            <Edit2 size={18} className="text-gray-500" />
          </button>
        }
      />

      <div className="pt-14">
        {/* Profile card */}
        <div className="mx-4 mt-4 bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600">
              {student.name[0]}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900">{student.name}</h2>
                {thisMonthPayment && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${paymentStatusMap[thisMonthPayment.status]?.bg} ${paymentStatusMap[thisMonthPayment.status]?.color}`}>
                    {paymentStatusMap[thisMonthPayment.status]?.label}
                  </span>
                )}
              </div>
              {schoolLabel && <p className="text-sm text-gray-500">{schoolLabel}</p>}
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {student.subjects?.map((sub) => (
                  <span key={sub} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                    {sub}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-4 mt-4 flex gap-0 bg-gray-100 rounded-xl p-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 min-w-fit py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap px-2 ${
                tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mx-4 mt-4 pb-6">
          {/* Info tab */}
          {tab === 'info' && (
            <div className="flex flex-col gap-3">
              <InfoCard label="연락처">
                <InfoRow label="학생" value={student.phone} icon={<Phone size={13} className="text-gray-400" />} />
                <InfoRow label="학부모" value={student.parentPhone} icon={<Phone size={13} className="text-gray-400" />} />
              </InfoCard>
              {student.depositorName && (
                <InfoCard label="수납 정보">
                  <InfoRow label="입금자명" value={student.depositorName} />
                </InfoCard>
              )}
              {student.memo && (
                <InfoCard label="메모">
                  <p className="text-sm text-gray-700">{student.memo}</p>
                </InfoCard>
              )}
              {student.tags?.length > 0 && (
                <InfoCard label="태그">
                  <div className="flex gap-2 flex-wrap">
                    {student.tags.map((tag) => (
                      <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </InfoCard>
              )}
              <button
                onClick={handleDelete}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-50 text-red-500 text-sm font-semibold mt-2"
              >
                <Trash2 size={15} />
                학생 삭제
              </button>
            </div>
          )}

          {/* Schedule tab */}
          {tab === 'schedule' && (
            <div className="flex flex-col gap-3">
              {studentGroups.length === 0 ? (
                <EmptyState
                  icon="📅"
                  title="등록된 정기 과외가 없어요"
                  description="정기 과외를 등록하면 수업 일정이 자동 생성돼요"
                  action={
                    <button
                      onClick={() => setShowClassForm(true)}
                      className="bg-blue-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl"
                    >
                      정기 과외 등록하기
                    </button>
                  }
                />
              ) : (
                studentGroups.map((group) => {
                  const groupClasses = classes.filter((c) => c.repeatGroupId === group.id);
                  const futureClasses = groupClasses.filter((c) => c.date >= todayStr);
                  const nextClass = futureClasses.sort((a, b) => a.date.localeCompare(b.date))[0];

                  return (
                    <div key={group.id} className="bg-white rounded-2xl p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-gray-900">{group.subject} 과외</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatDays(group.daysOfWeek)}요일 · {group.repeatType}
                          </p>
                        </div>
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full font-medium">
                          총 {groupClasses.length}회
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5 mb-3">
                        <p className="text-xs text-gray-600">
                          {group.startTime} – {group.endTime}
                          {group.location ? ` · ${group.location}` : ''}
                        </p>
                        {group.monthlyFee > 0 && (
                          <p className="text-xs text-gray-600">
                            {formatCurrency(group.monthlyFee)} / 월 · 매월 {group.paymentDay}일
                          </p>
                        )}
                        {nextClass && (
                          <p className="text-xs text-blue-600 font-medium">
                            다음 수업: {formatDateShort(nextClass.date)} {nextClass.startTime}
                          </p>
                        )}
                        <p className="text-xs text-gray-400">
                          {group.startDate} ~ {group.endDate || '(3개월)'}
                        </p>
                      </div>

                      {futureClasses.length > 0 && (
                        <button
                          onClick={() => {
                            if (window.confirm(`앞으로의 ${futureClasses.length}개 수업을 삭제할까요?\n이미 완료된 수업은 유지됩니다.`)) {
                              deleteRepeatGroupFuture(group.id, todayStr);
                            }
                          }}
                          className="w-full py-2.5 rounded-xl text-xs font-semibold bg-red-50 text-red-500"
                        >
                          앞으로의 수업 삭제 ({futureClasses.length}개)
                        </button>
                      )}
                    </div>
                  );
                })
              )}
              <button
                onClick={() => setShowClassForm(true)}
                className="w-full py-3 rounded-xl border-2 border-dashed border-blue-200 text-blue-600 text-sm font-semibold"
              >
                + 정기 과외 추가하기
              </button>
            </div>
          )}

          {/* Records tab */}
          {tab === 'records' && (
            <div className="flex flex-col gap-3">
              {studentRecords.length === 0 ? (
                <EmptyState icon="📓" title="수업 기록이 없어요" />
              ) : (
                studentRecords.map((rec) => {
                  const cls = classes.find((c) => c.id === rec.classId);
                  return (
                    <button
                      key={rec.id}
                      onClick={() => cls && navigateToClass(cls.id)}
                      className="bg-white rounded-2xl p-4 shadow-sm text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-400">{formatDateShort(rec.date)}</p>
                        {rec.noticeStatus === 'sent' && (
                          <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">알림장 전송</span>
                        )}
                      </div>
                      {rec.content && <p className="text-sm font-semibold text-gray-800 mb-1">{rec.content}</p>}
                      {rec.homework && <p className="text-xs text-gray-500">숙제: {rec.homework}</p>}
                      {rec.memo && <p className="text-xs text-gray-400 mt-1">{rec.memo}</p>}
                      {rec.evaluation && Object.keys(rec.evaluation).length > 0 && (
                        <div className="mt-2 flex gap-1 flex-wrap">
                          {Object.entries(rec.evaluation).map(([key, val]) => {
                            const colors = { poor: 'bg-red-50 text-red-600', fair: 'bg-orange-50 text-orange-600', good: 'bg-blue-50 text-blue-600', great: 'bg-green-50 text-green-600' };
                            const labels = { focus: '집중', attitude: '태도', understanding: '이해', homework: '숙제', achievement: '성취' };
                            return (
                              <span key={key} className={`text-xs px-2 py-0.5 rounded-full ${colors[val]}`}>
                                {labels[key]}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Attendance tab */}
          {tab === 'attendance' && (
            <div className="flex flex-col gap-2">
              {studentAttendance.length === 0 ? (
                <EmptyState icon="📋" title="출결 기록이 없어요" />
              ) : (
                studentAttendance.map((rec) => {
                  const cls = classes.find((c) => c.id === rec.classId);
                  const meta = attendanceStatusMap[rec.status];
                  return (
                    <div key={rec.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{formatDateShort(rec.date)}</p>
                        <p className="text-xs text-gray-400">{cls?.name || '수업'}</p>
                      </div>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${meta?.bg} ${meta?.color}`}>
                        {meta?.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Payments tab */}
          {tab === 'payments' && (
            <div className="flex flex-col gap-2">
              {studentPayments.length === 0 ? (
                <EmptyState icon="💳" title="수납 기록이 없어요" />
              ) : (
                studentPayments.map((p) => {
                  const meta = paymentStatusMap[p.status];
                  return (
                    <div key={p.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.month.replace('-', '년 ')}월</p>
                        <p className="text-xs text-gray-400">결제 예정일 {p.dueDate}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{formatCurrency(p.amount)}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta?.bg} ${meta?.color}`}>
                          {meta?.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {showEdit && <StudentFormModal initial={student} onClose={() => setShowEdit(false)} />}
      {showClassForm && (
        <ClassFormModal
          onClose={() => setShowClassForm(false)}
          preselectedStudentIds={[student.id]}
        />
      )}
    </div>
  );
}

function InfoCard({ label, children }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wide">{label}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, icon }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-xs text-gray-400 w-14 flex-shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value || '-'}</span>
    </div>
  );
}
