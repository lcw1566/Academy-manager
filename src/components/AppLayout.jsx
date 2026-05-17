import { AnimatePresence, motion } from 'framer-motion';
import useAcademyStore from '../store/useAcademyStore';
import BottomNav from './BottomNav';
import DashboardPage from '../features/dashboard/DashboardPage';
import ClassesPage from '../features/classes/ClassesPage';
import ClassDetailPage from '../features/classes/ClassDetailPage';
import LessonGroupDetailPage from '../features/classes/LessonGroupDetailPage';
import StudentsPage from '../features/students/StudentsPage';
import StudentDetailPage from '../features/students/StudentDetailPage';
import PaymentsPage from '../features/payments/PaymentsPage';
import MorePage from '../features/more/MorePage';

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
};

export default function AppLayout() {
  const { activeTab, selectedClassId, selectedStudentId, selectedRepeatGroupId } = useAcademyStore();

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
    return null;
  };

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <main className="main-content max-w-md mx-auto">
        <AnimatePresence mode="sync">
          <motion.div
            key={pageKey}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.12, ease: 'easeOut' }}
            style={{ willChange: 'opacity' }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav />
    </div>
  );
}
