import { useEffect, useMemo, useState } from 'react';
import ScheduleCalendar from '../../../components/calendar/ScheduleCalendar';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { CALENDAR_CATEGORY_TONES, getAcademyCalendarCategory } from '../../../constants/academyCalendar';
import { enumerateDates } from '../../../utils/schedule';
import { currentUserCan } from '../../../utils/staffPermissions';
import AcademyCalendarEventModal from './AcademyCalendarEventModal';

function targetSummary(event) {
  if (event.target_type === 'school') {
    return [...(event.school_names || []), ...(event.grades || [])].join(' · ') || '학교·학년';
  }
  if (event.target_type === 'class') return `${(event.class_group_ids || []).length}개 반`;
  if (event.target_type === 'student') return `${(event.student_ids || []).length}명`;
  return '학원 전체';
}

export default function AcademyScheduleCalendar({
  selectedDate,
  onSelectDate,
  schedules = [],
  title,
  emptyText,
  compact = false,
}) {
  const role = useAcademyStore((state) => state.role);
  const authUserId = useAuthStore((state) => state.user?.id);
  const currentAcademyId = useWorkspaceStore((state) => state.currentAcademyId);
  const staffProfiles = useWorkspaceStore((state) => state.academyStaffProfiles) ?? [];
  const events = useWorkspaceStore((state) => state.academyCalendarEvents) ?? [];
  const loadEvents = useWorkspaceStore((state) => state.loadAcademyCalendarEvents);
  const [modal, setModal] = useState(null);

  const myStaffProfile = useMemo(() => staffProfiles.find((profile) => profile.user_id === authUserId) || null, [authUserId, staffProfiles]);
  const canManageClasses = currentUserCan({ role, staffProfile: myStaffProfile }, 'canManageClasses');

  useEffect(() => {
    if (currentAcademyId) void loadEvents();
  }, [currentAcademyId, loadEvents]);

  const calendarEvents = useMemo(() => events.flatMap((event) => {
    const category = getAcademyCalendarCategory(event.category);
    return enumerateDates(event.start_date, event.end_date).map((date) => ({
      id: `academy-event:${event.id}:${date}`,
      date,
      type: 'academy-event',
      allDay: event.all_day !== false,
      startTime: event.start_time?.slice(0, 5) || null,
      endTime: event.end_time?.slice(0, 5) || null,
      title: `${category.emoji} ${event.title}`,
      subtitle: targetSummary(event),
      badge: category.label,
      tone: CALENDAR_CATEGORY_TONES[event.category] || CALENDAR_CATEGORY_TONES.other,
      onClick: () => setModal({ event, initialDate: date }),
    }));
  }), [events]);

  const merged = useMemo(() => [...schedules, ...calendarEvents], [calendarEvents, schedules]);
  const editable = modal?.event
    ? modal.event.affects_classes
      ? canManageClasses
      : modal.event.created_by === authUserId || canManageClasses
    : true;

  return (
    <>
      <ScheduleCalendar
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        schedules={merged}
        title={title}
        emptyText={emptyText}
        compact={compact}
        onAddEvent={(date) => setModal({ event: null, initialDate: date || selectedDate })}
      />
      {modal && (
        <AcademyCalendarEventModal
          event={modal.event}
          initialDate={modal.initialDate}
          canEdit={editable}
          canManageClasses={canManageClasses}
          classSchedules={schedules}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
