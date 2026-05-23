import { useEffect } from 'react';
import useAcademyStore from '../store/useAcademyStore';
import BottomNav, { PRIVATE_TABS } from './BottomNav';
import Sidebar from './Sidebar';
import DashboardPage from '../features/dashboard/DashboardPage';
import ClassesPage from '../features/classes/ClassesPage';
import ClassDetailPage from '../features/classes/ClassDetailPage';
import LessonGroupDetailPage from '../features/classes/LessonGroupDetailPage';
import StudentsPage from '../features/students/StudentsPage';
import StudentDetailPage from '../features/students/StudentDetailPage';
import PaymentsPage from '../features/payments/PaymentsPage';
import MorePage from '../features/more/MorePage';

const PRIVATE_TAB_IDS = ['home', 'classes', 'students', 'payments', 'more'];

export default function AppLayout() {
  const activeTab = useAcademyStore((s) => s.activeTab);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const selectedClassId = useAcademyStore((s) => s.selectedClassId);
  const selectedStudentId = useAcademyStore((s) => s.selectedStudentId);
  const selectedRepeatGroupId = useAcademyStore((s) => s.selectedRepeatGroupId);
  const students = useAcademyStore((s) => s.students);
  const classes = useAcademyStore((s) => s.classes);
  const repeatGroups = useAcademyStore((s) => s.repeatGroups);
  const goBackFromClass = useAcademyStore((s) => s.goBackFromClass);
  const goBackFromStudent = useAcademyStore((s) => s.goBackFromStudent);
  const goBackFromRepeatGroup = useAcademyStore((s) => s.goBackFromRepeatGroup);

  useEffect(() => {
    if (!PRIVATE_TAB_IDS.includes(activeTab)) {
      setActiveTab('home');
    }
  }, [activeTab, setActiveTab]);

  useEffect(() => {
    if (selectedClassId && !classes.some((cls) => cls.id === selectedClassId)) {
      goBackFromClass();
    }
  }, [selectedClassId, classes, goBackFromClass]);

  useEffect(() => {
    if (selectedStudentId && !students.some((student) => student.id === selectedStudentId)) {
      goBackFromStudent();
    }
  }, [selectedStudentId, students, goBackFromStudent]);

  useEffect(() => {
    if (selectedRepeatGroupId && !repeatGroups.some((group) => group.id === selectedRepeatGroupId)) {
      goBackFromRepeatGroup();
    }
  }, [selectedRepeatGroupId, repeatGroups, goBackFromRepeatGroup]);

  const pageKey = selectedRepeatGroupId
    ? `repeatgroup-${selectedRepeatGroupId}`
    : selectedClassId
    ? `class-${selectedClassId}`
    : selectedStudentId
    ? `student-${selectedStudentId}`
    : activeTab;

  const renderContent = () => {
    if (activeTab === 'home')     return <DashboardPage />;
    if (activeTab === 'classes') {
      if (selectedRepeatGroupId) return <LessonGroupDetailPage />;
      if (selectedClassId)       return <ClassDetailPage />;
      return <ClassesPage />;
    }
    if (activeTab === 'students') return selectedStudentId ? <StudentDetailPage /> : <StudentsPage />;
    if (activeTab === 'payments') return <PaymentsPage />;
    if (activeTab === 'more')     return <MorePage />;
    return <DashboardPage />;
  };

  return (
    <div className="min-h-screen bg-[#F2F4F6] md:flex">
      {/* PC 사이드바 — md 이상에서만 표시 */}
      <Sidebar tabs={PRIVATE_TABS} />

      <main className="flex-1 min-w-0">
        <div className="main-content max-w-md mx-auto md:mx-0 md:max-w-none md:px-8 md:py-6 pb-24 md:pb-8">
          <div key={pageKey}>
            {renderContent()}
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
