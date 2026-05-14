import { Home, BookOpen, Users, CreditCard, MoreHorizontal } from 'lucide-react';
import useAcademyStore from '../store/useAcademyStore';

const tabs = [
  { id: 'home',     label: '홈',   icon: Home },
  { id: 'classes',  label: '수업', icon: BookOpen },
  { id: 'students', label: '학생', icon: Users },
  { id: 'payments', label: '수납', icon: CreditCard },
  { id: 'more',     label: '더보기', icon: MoreHorizontal },
];

export default function BottomNav() {
  const { activeTab, setActiveTab, role } = useAcademyStore();

  const visibleTabs = role === 'teacher'
    ? tabs.filter((t) => t.id !== 'payments')
    : tabs;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 safe-area-inset-bottom">
      <div className="max-w-md mx-auto flex">
        {visibleTabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex-1 flex flex-col items-center py-2 gap-0.5"
            >
              <Icon
                size={22}
                className={active ? 'text-blue-600' : 'text-gray-400'}
                strokeWidth={active ? 2.5 : 1.8}
              />
              <span className={`text-[10px] font-medium ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
