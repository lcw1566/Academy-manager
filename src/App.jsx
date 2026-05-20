import { useEffect } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import useAcademyStore from './store/useAcademyStore';
import useAuthStore from './store/useAuthStore';
import useWorkspaceStore from './store/useWorkspaceStore';
import RoleSelectPage from './features/auth/RoleSelectPage';
import AuthPage from './features/auth/AuthPage';
import AppLayout from './components/AppLayout';
import AcademyAppLayout from './features/academy/AcademyAppLayout';
import Toast from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';

const ACADEMY_ROLES = ['owner', 'teacher', 'assistant'];

export default function App() {
  const { role, toast } = useAcademyStore();
  const initializeAuth = useAuthStore((s) => s.initializeAuth);
  const isAuthPanelOpen = useAuthStore((s) => s.isAuthPanelOpen);
  const closeAuthPanel = useAuthStore((s) => s.closeAuthPanel);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initializeWorkspace = useWorkspaceStore((s) => s.initializeWorkspace);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (isAuthenticated) {
      initializeWorkspace();
    } else {
      clearWorkspace();
    }
  }, [isAuthenticated, initializeWorkspace, clearWorkspace]);

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
        {isAuthPanelOpen && (
          <div className="fixed inset-0 z-50 bg-[#F5F6F8] overflow-y-auto">
            <AuthPage onAuthSuccess={closeAuthPanel} onCancel={closeAuthPanel} />
          </div>
        )}
        <AnimatePresence>
          {toast && <Toast key={toast.message} message={toast.message} type={toast.type} />}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
