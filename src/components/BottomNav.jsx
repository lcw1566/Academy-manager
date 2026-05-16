import { Home, BookOpen, Users, CreditCard, MoreHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import useAcademyStore from '../store/useAcademyStore';

const tabs = [
  { id: 'home',     label: '홈',    icon: Home },
  { id: 'classes',  label: '수업',  icon: BookOpen },
  { id: 'students', label: '학생',  icon: Users },
  { id: 'payments', label: '수납',  icon: CreditCard },
  { id: 'more',     label: '더보기', icon: MoreHorizontal },
];

export default function BottomNav() {
  const { activeTab, setActiveTab, role } = useAcademyStore();

  const visibleTabs = role === 'teacher'
    ? tabs.filter((t) => t.id !== 'payments')
    : tabs;

  return (
    <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 shadow-[0_-1px_0_rgba(0,0,0,0.06)]">
      <div className="max-w-md mx-auto flex pt-2">
        {visibleTabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <motion.button
              key={id}
              onClick={() => setActiveTab(id)}
              whileTap={{ scale: 0.97 }}
              className="flex-1 flex flex-col items-center gap-1 pb-1"
            >
              <div className={`flex items-center justify-center w-10 h-7 rounded-2xl transition-colors ${
                active ? 'bg-blue-50' : ''
              }`}>
                <Icon
                  size={21}
                  className={active ? 'text-blue-600' : 'text-gray-400'}
                  strokeWidth={active ? 2.5 : 1.8}
                />
              </div>
              <span className={`text-[10px] font-medium ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
