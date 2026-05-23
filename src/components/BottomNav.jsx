import { Home, BookOpen, Users, CreditCard, MoreHorizontal } from 'lucide-react';
import useAcademyStore from '../store/useAcademyStore';

// 과외 모드 탭 목록. PC Sidebar 도 동일 목록을 재사용한다.
export const PRIVATE_TABS = [
  { id: 'home',     label: '홈',    icon: Home },
  { id: 'classes',  label: '수업',  icon: BookOpen },
  { id: 'students', label: '학생',  icon: Users },
  { id: 'payments', label: '수납',  icon: CreditCard },
  { id: 'more',     label: '더보기', icon: MoreHorizontal },
];

const tabs = PRIVATE_TABS;

export default function BottomNav() {
  const activeTab = useAcademyStore((s) => s.activeTab);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const role = useAcademyStore((s) => s.role);

  const visibleTabs = role === 'teacher'
    ? tabs.filter((t) => t.id !== 'payments')
    : tabs;

  return (
    <nav className="md:hidden bottom-nav fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 shadow-[0_-1px_0_rgba(0,0,0,0.06)]">
      <div className="max-w-md mx-auto flex pt-2">
        {visibleTabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={active ? 'page' : undefined}
              className="flex-1 flex flex-col items-center gap-1 pb-1 active:scale-[0.98] transition-transform"
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
            </button>
          );
        })}
      </div>
    </nav>
  );
}
