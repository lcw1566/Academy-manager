import useAcademyStore from './store/useAcademyStore';
import RoleSelectPage from './features/auth/RoleSelectPage';
import AppLayout from './components/AppLayout';
import Toast from './components/Toast';

export default function App() {
  const { role, toast } = useAcademyStore();

  return (
    <div className="min-h-screen bg-gray-50">
      {!role ? <RoleSelectPage /> : <AppLayout />}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
