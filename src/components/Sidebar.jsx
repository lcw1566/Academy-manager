// Sidebar
//
// Phase 18 — PC (md+) 전용 좌측 사이드바.
// 모바일에서는 hidden, md 이상에서만 표시.
//
// 사용 예:
//   <Sidebar tabs={TAB_CONFIG[role]} />
//
// tabs 항목은 { id, label, Icon } 또는 { id, label, icon } 형식 둘 다 지원
// (학원 모드 = Icon, 과외 모드 BottomNav = icon).
import { Building2 } from 'lucide-react';
import useAcademyStore from '../store/useAcademyStore';
import useAuthStore from '../store/useAuthStore';
import useWorkspaceStore from '../store/useWorkspaceStore';

const ROLE_LABEL = {
  tutor: '과외 선생님',
  owner: '원장',
  teacher: '강사',
  assistant: '보조강사',
};

export default function Sidebar({ tabs, badges = {} }) {
  const role = useAcademyStore((s) => s.role);
  const activeTab = useAcademyStore((s) => s.activeTab);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const userEmail = useAuthStore((s) => s.user?.email);
  const memberships = useWorkspaceStore((s) => s.memberships);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const currentMembership = memberships.find((m) => m.academy_id === currentAcademyId);
  const academyName = currentMembership?.academy?.name;

  return (
    <aside className="hidden md:flex md:flex-col w-[260px] shrink-0 bg-white border-r border-gray-100 h-screen sticky top-0">
      {/* 브랜드 + 역할 */}
      <div className="px-5 py-5 border-b border-gray-50">
        <p className="text-base font-bold text-gray-900">클래스노트</p>
        <p className="text-xs text-gray-500 mt-1">{ROLE_LABEL[role] ?? role ?? ''}</p>
      </div>

      {/* 탭 목록 */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5">
        {(tabs || []).map((tab) => {
          const IconComponent = tab.Icon || tab.icon;
          const active = activeTab === tab.id;
          const badge = badges[tab.id] || 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {IconComponent && (
                <IconComponent
                  size={18}
                  strokeWidth={active ? 2.4 : 1.8}
                />
              )}
              <span className="text-sm font-semibold">{tab.label}</span>
              {badge > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 워크스페이스 / 계정 요약 */}
      {(academyName || userEmail) && (
        <div className="px-4 py-4 border-t border-gray-50">
          {academyName && (
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={13} className="text-gray-400 flex-shrink-0" />
              <p className="text-xs font-semibold text-gray-700 truncate">{academyName}</p>
            </div>
          )}
          {userEmail && (
            <p className="text-[11px] text-gray-400 truncate">{userEmail}</p>
          )}
        </div>
      )}
    </aside>
  );
}
