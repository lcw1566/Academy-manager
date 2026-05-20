import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: -4, transition: { duration: 0.08, ease: 'easeIn' } },
};

const PRIVATE_TAB_IDS = ['home', 'classes', 'students', 'payments', 'more'];

export default function AppLayout() {
  const {
    activeTab,
    setActiveTab,
    selectedClassId,
    selectedStudentId,
    selectedRepeatGroupId,
    students,
    classes,
    repeatGroups,
    goBackFromClass,
    goBackFromStudent,
    goBackFromRepeatGroup,
  } = useAcademyStore();

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
    <div className="min-h-screen bg-[#F5F6F8] md:flex">
      {/* PC 사이드바 — md 이상에서만 표시 */}
      <Sidebar tabs={PRIVATE_TABS} />

      <main className="flex-1 min-w-0">
        <div className="main-content max-w-md mx-auto md:mx-0 md:max-w-none md:px-8 md:py-6 pb-24 md:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={pageKey}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              style={{ willChange: 'opacity, transform' }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
