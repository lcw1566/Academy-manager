// WorkspaceSelectionPage
//
// Phase 28 — 강사 / 보조강사가 여러 학원에 소속된 경우, 로그인 직후 어떤 학원으로
// 진입할지 카드 형태로 선택하는 화면.
//
// 동작:
//   - 카드: 학원 이름 + 본인 권한 라벨(강사/보조강사) + 화살표
//   - 선택 시 setCurrentAcademyId + sessionStorage 표시 → App.jsx 가 다시 라우팅
//
// 보여지는 조건 (App.jsx 에서 결정):
//   - 인증됨, workspace ready
//   - 본인 권한이 teacher / assistant 중 하나
//   - memberships.length > 1
//   - 같은 세션에서 한 번도 선택 안 함 (sessionStorage 키)
//
// "학원 전환" 더보기 옵션을 누르면 sessionStorage 키를 비우고 다시 이 화면을 띄운다.
import { useState } from 'react';
import { Building2, ChevronRight, LogOut } from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import useAcademyStore from '../../store/useAcademyStore';
import { roleMap } from '../../utils/format';

export const WORKSPACE_PICKED_KEY = 'workspace-picked';

export function markWorkspacePicked() {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.setItem(WORKSPACE_PICKED_KEY, '1'); } catch { /* ignore */ }
}

export function clearWorkspacePicked() {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.removeItem(WORKSPACE_PICKED_KEY); } catch { /* ignore */ }
}

export function wasWorkspacePicked() {
  if (typeof sessionStorage === 'undefined') return false;
  try { return sessionStorage.getItem(WORKSPACE_PICKED_KEY) === '1'; } catch { return false; }
}

export default function WorkspaceSelectionPage() {
  const memberships = useWorkspaceStore((s) => s.memberships);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const setCurrentAcademyId = useWorkspaceStore((s) => s.setCurrentAcademyId);
  const signOutUser = useAuthStore((s) => s.signOutUser);
  const showToast = useAcademyStore((s) => s.showToast);

  const [submitting, setSubmitting] = useState(false);

  const handlePick = (academyId) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (academyId !== currentAcademyId) setCurrentAcademyId(academyId);
      markWorkspacePicked();
      // setCurrentAcademyId 가 비동기 fetch 를 트리거하지만, App.jsx 의 auto-role
      // effect 가 새 academy 의 membership 으로 즉시 진입시킨다.
    } finally {
      // 같은 tick 에서 sessionStorage 가 갱신되면 App.jsx 가 다음 render 에서
      // 이 화면을 더 이상 안 그린다.
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (err) {
      showToast(err?.message ?? '로그아웃에 실패했어요.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center px-6 pt-14">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🏫</div>
          <h1 className="text-xl font-bold text-gray-900">학원을 선택해주세요</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            여러 학원에 소속되어 있어요.<br />어떤 학원으로 들어갈지 골라주세요.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {memberships.map((m) => {
            const academyName = m.academy?.name ?? '(이름 없음)';
            const roleLabel = roleMap[m.role] ?? m.role;
            const isCurrent = m.academy_id === currentAcademyId;
            return (
              <button
                key={m.id}
                type="button"
                disabled={submitting}
                onClick={() => handlePick(m.academy_id)}
                className={`w-full flex items-center gap-3 rounded-2xl px-4 py-4 text-left transition-colors shadow-sm ${
                  isCurrent
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-white border border-transparent active:bg-gray-50'
                } disabled:opacity-60`}
              >
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCurrent ? 'bg-blue-100' : 'bg-gray-100'
                  }`}
                >
                  <Building2
                    size={18}
                    className={isCurrent ? 'text-blue-600' : 'text-gray-400'}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-gray-900 truncate">{academyName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{roleLabel}</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="w-full mt-8 flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-400 hover:text-red-500"
        >
          <LogOut size={12} />
          다른 계정으로 로그인
        </button>
      </div>
    </div>
  );
}
