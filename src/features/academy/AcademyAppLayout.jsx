import { AnimatePresence, motion } from 'framer-motion';
import { Home, BookOpen, Users, Stethoscope, MoreHorizontal, CheckSquare } from 'lucide-react';
import useAcademyStore from '../../store/useAcademyStore';
import OwnerDashboard from './dashboard/OwnerDashboard';
import TeacherDashboard from './dashboard/TeacherDashboard';
import AssistantDashboard from './dashboard/AssistantDashboard';
import ClassGroupsPage from './classes/ClassGroupsPage';
import ClassGroupDetailPage from './classes/ClassGroupDetailPage';
import ClassSessionPage from './classes/ClassSessionPage';
import ClinicPage from './clinic/ClinicPage';
import AcademyStudentsPage from './students/AcademyStudentsPage';
import AcademyStudentDetailPage from './students/AcademyStudentDetailPage';
import AcademyMorePage from './more/AcademyMorePage';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 4 },
};

const TAB_CONFIG = {
  owner: [
    { id: 'home',     label: '홈',    Icon: Home },
    { id: 'classes',  label: '수업',  Icon: BookOpen },
    { id: 'students', label: '학생',  Icon: Users },
    { id: 'clinic',   label: '클리닉', Icon: Stethoscope },
    { id: 'more',     label: '더보기', Icon: MoreHorizontal },
  ],
  teacher: [
    { id: 'home',     label: '홈',    Icon: Home },
    { id: 'classes',  label: '수업',  Icon: BookOpen },
    { id: 'students', label: '학생',  Icon: Users },
    { id: 'clinic',   label: '클리닉', Icon: Stethoscope },
    { id: 'more',     label: '더보기', Icon: MoreHorizontal },
  ],
  assistant: [
    { id: 'home',     label: '홈',    Icon: Home },
    { id: 'clinic',   label: '클리닉', Icon: Stethoscope },
    { id: 'students', label: '학생',  Icon: Users },
    { id: 'check',    label: '체크',  Icon: CheckSquare },
    { id: 'more',     label: '더보기', Icon: MoreHorizontal },
  ],
};

export default function AcademyAppLayout() {
  const {
    role,
    activeTab,
    setActiveTab,
    selectedClassGroupId,
    selectedClassSessionId,
    selectedAcademyStudentId,
  } = useAcademyStore();

  const tabs = TAB_CONFIG[role] || TAB_CONFIG.owner;

  const pageKey = selectedClassSessionId
    ? `session-${selectedClassSessionId}`
    : selectedClassGroupId
    ? `group-${selectedClassGroupId}`
    : selectedAcademyStudentId
    ? `astudent-${selectedAcademyStudentId}`
    : activeTab;

  const renderDashboard = () => {
    if (role === 'owner')     return <OwnerDashboard />;
    if (role === 'teacher')   return <TeacherDashboard />;
    if (role === 'assistant') return <AssistantDashboard />;
    return <OwnerDashboard />;
  };

  const renderClasses = () => {
    if (selectedClassSessionId) return <ClassSessionPage />;
    if (selectedClassGroupId)   return <ClassGroupDetailPage />;
    return <ClassGroupsPage />;
  };

  const renderContent = () => {
    if (selectedClassSessionId) return <ClassSessionPage />;
    if (activeTab === 'home')     return renderDashboard();
    if (activeTab === 'classes')  return selectedClassGroupId ? <ClassGroupDetailPage /> : <ClassGroupsPage />;
    if (activeTab === 'students') return selectedAcademyStudentId ? <AcademyStudentDetailPage /> : <AcademyStudentsPage />;
    if (activeTab === 'clinic')   return <ClinicPage />;
    if (activeTab === 'check')    return <ClinicPage checkMode />;
    if (activeTab === 'more')     return <AcademyMorePage />;
    return renderDashboard();
  };

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <main className="main-content max-w-md mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={pageKey}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 shadow-[0_-1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-md mx-auto flex pt-2">
          {tabs.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <motion.button
                key={id}
                onClick={() => setActiveTab(id)}
                whileTap={{ scale: 0.97 }}
                className="flex-1 flex flex-col items-center gap-1 pb-1"
              >
                <div className={`flex items-center justify-center w-10 h-7 rounded-2xl transition-colors ${active ? 'bg-blue-50' : ''}`}>
                  <Icon size={21} className={active ? 'text-blue-600' : 'text-gray-400'} strokeWidth={active ? 2.5 : 1.8} />
                </div>
                <span className={`text-[10px] font-medium ${active ? 'text-blue-600' : 'text-gray-400'}`}>{label}</span>
              </motion.button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
