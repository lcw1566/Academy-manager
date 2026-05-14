import useAcademyStore from '../store/useAcademyStore';
import BottomNav from './BottomNav';
import DashboardPage from '../features/dashboard/DashboardPage';
import ClassesPage from '../features/classes/ClassesPage';
import ClassDetailPage from '../features/classes/ClassDetailPage';
import StudentsPage from '../features/students/StudentsPage';
import StudentDetailPage from '../features/students/StudentDetailPage';
import PaymentsPage from '../features/payments/PaymentsPage';
import MorePage from '../features/more/MorePage';

export default function AppLayout() {
  const { activeTab, selectedClassId, selectedStudentId } = useAcademyStore();

  const renderContent = () => {
    if (activeTab === 'home')     return <DashboardPage />;
    if (activeTab === 'classes')  return selectedClassId ? <ClassDetailPage /> : <ClassesPage />;
    if (activeTab === 'students') return selectedStudentId ? <StudentDetailPage /> : <StudentsPage />;
    if (activeTab === 'payments') return <PaymentsPage />;
    if (activeTab === 'more')     return <MorePage />;
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-md mx-auto pb-20">
        {renderContent()}
      </main>
      <BottomNav />
    </div>
  );
}
