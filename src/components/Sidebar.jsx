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
import { useState } from 'react';
import { Building2, MessageCircleQuestion } from 'lucide-react';
import useAcademyStore from '../store/useAcademyStore';
import useAuthStore from '../store/useAuthStore';
import useWorkspaceStore from '../store/useWorkspaceStore';
import FeedbackModal from './FeedbackModal';

const ROLE_LABEL = {
  tutor: '과외 선생님',
  owner: '원장',
  teacher: '선생님',
  assistant: '선생님',
  manager: '운영 매니저',
};

export default function Sidebar({ tabs, badges = {}, onTabSelect, activeTabIds = [] }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const role = useAcademyStore((s) => s.role);
  const activeTab = useAcademyStore((s) => s.activeTab);
  const setActiveTab = useAcademyStore((s) => s.setActiveTab);
  const userEmail = useAuthStore((s) => s.user?.email);
  const memberships = useWorkspaceStore((s) => s.memberships);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const currentMembership = memberships.find((m) => m.academy_id === currentAcademyId);
  const academyName = currentMembership?.academy?.name;

  return (
    <>
      <aside className="hidden md:flex md:flex-col w-[260px] shrink-0 bg-seenit-surface border-r border-seenit-border-soft h-screen sticky top-0">
        {/* 브랜드 + 역할 */}
        <div className="flex items-center justify-between gap-3 border-b border-seenit-border-soft px-5 py-5">
          <div className="min-w-0">
            <p className="text-base font-bold text-seenit-ink">씨닛</p>
            <p className="mt-1 truncate text-xs text-seenit-muted">{ROLE_LABEL[role] ?? role ?? ''}</p>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-seenit-border bg-seenit-surface px-2.5 text-xs font-bold text-seenit-secondary transition-colors hover:bg-seenit-elevated"
            aria-label="버그 신고 및 개선 제안"
            title="버그 신고 및 개선 제안"
          >
            <MessageCircleQuestion size={16} />
            의견
          </button>
        </div>

      {/* 탭 목록 */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-0.5">
        {(tabs || []).map((tab) => {
          const IconComponent = tab.Icon || tab.icon;
          const active = activeTab === tab.id || activeTabIds.includes(tab.id);
          const badge = badges[tab.id] || 0;
          const pilotLocked = tab.pilotLocked === true;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                const handled = onTabSelect?.(tab) === true;
                if (!handled) setActiveTab(tab.id);
              }}
              aria-label={pilotLocked ? `${tab.label}, 추후 제공 예정` : tab.label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                pilotLocked
                  ? active
                    ? 'bg-seenit-control text-seenit-muted opacity-70'
                    : 'text-seenit-subtle opacity-55 hover:bg-seenit-elevated'
                  : active
                  ? 'bg-seenit-brand-soft text-seenit-brand'
                  : 'text-seenit-secondary hover:bg-seenit-elevated'
              }`}
            >
              {IconComponent && (
                <IconComponent
                  size={18}
                  strokeWidth={active ? 2.4 : 1.8}
                />
              )}
              <span className="text-sm font-semibold">{tab.label}</span>
              {pilotLocked && (
                <span className="ml-auto rounded-full bg-seenit-control px-2 py-0.5 text-[10px] font-bold text-seenit-subtle">
                  준비 중
                </span>
              )}
              {badge > 0 && (
                <span className={`${pilotLocked ? '' : 'ml-auto'} min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center`}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 워크스페이스 / 계정 요약 */}
      {(academyName || userEmail) && (
        <div className="px-4 py-4 border-t border-seenit-border-soft">
          {academyName && (
            <div className="flex items-center gap-2 mb-1">
              <Building2 size={13} className="text-seenit-subtle flex-shrink-0" />
              <p className="text-xs font-semibold text-seenit-secondary truncate">{academyName}</p>
            </div>
          )}
          {userEmail && (
            <p className="text-[11px] text-seenit-subtle truncate">{userEmail}</p>
          )}
        </div>
      )}
      </aside>

      <button
        type="button"
        onClick={() => setFeedbackOpen(true)}
        className="fixed bottom-[5.25rem] right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-seenit-border bg-seenit-surface text-seenit-secondary shadow-lg md:hidden"
        aria-label="버그 신고 및 개선 제안"
        title="버그 신고 및 개선 제안"
      >
        <MessageCircleQuestion size={21} />
      </button>

      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
