import { AnimatePresence, MotionConfig } from 'framer-motion';
import useAcademyStore from './store/useAcademyStore';
import RoleSelectPage from './features/auth/RoleSelectPage';
import AppLayout from './components/AppLayout';
import AcademyAppLayout from './features/academy/AcademyAppLayout';
import Toast from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';

const ACADEMY_ROLES = ['owner', 'teacher', 'assistant'];

export default function App() {
  const { role, toast } = useAcademyStore();

  const renderLayout = () => {
    if (!role) return <RoleSelectPage />;
    if (ACADEMY_ROLES.includes(role)) return <AcademyAppLayout />;
    return <AppLayout />;
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#F5F6F8]">
        <ErrorBoundary>
          {renderLayout()}
        </ErrorBoundary>
        <AnimatePresence>
          {toast && <Toast key={toast.message} message={toast.message} type={toast.type} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
