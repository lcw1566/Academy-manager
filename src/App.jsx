import { AnimatePresence, MotionConfig } from 'framer-motion';
import useAcademyStore from './store/useAcademyStore';
import RoleSelectPage from './features/auth/RoleSelectPage';
import AppLayout from './components/AppLayout';
import Toast from './components/Toast';

export default function App() {
  const { role, toast } = useAcademyStore();

  return (
    // reducedMotion="user" respects prefers-reduced-motion OS setting
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#F5F6F8]">
        {!role ? <RoleSelectPage /> : <AppLayout />}
        <AnimatePresence>
          {toast && <Toast key={toast.message} message={toast.message} type={toast.type} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
