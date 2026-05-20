import { Cloud, CloudOff, LogIn, LogOut, Loader2, Check } from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useAcademyStore from '../../store/useAcademyStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';

export default function AuthSection() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isSupabaseReady = useAuthStore((s) => s.isSupabaseReady);
  const isAuthLoading = useAuthStore((s) => s.isAuthLoading);
  const openAuthPanel = useAuthStore((s) => s.openAuthPanel);
  const signOutUser = useAuthStore((s) => s.signOutUser);
  const showToast = useAcademyStore((s) => s.showToast);
  const profile = useWorkspaceStore((s) => s.profile);
  const isWorkspaceLoading = useWorkspaceStore((s) => s.isWorkspaceLoading);

  // Supabase 미설정 상태
  if (!isSupabaseReady) {
    return (
      <div className="mx-4 mt-5">
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <CloudOff size={18} className="text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-700">서버 연결 준비 중</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Supabase 환경변수를 설정하면 로그인 기능을 사용할 수 있어요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    try {
      await signOutUser();
      showToast('로그아웃되었어요.');
    } catch {
      // store.authError로 처리됨
    }
  };

  // 로그인됨
  if (isAuthenticated) {
    return (
      <div className="mx-4 mt-5">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
              <Cloud size={18} className="text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">계정 연결됨</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {user?.email || '서버에 로그인되어 있어요'}
              </p>
              {profile ? (
                <p className="text-[11px] text-green-600 mt-0.5 flex items-center gap-1">
                  <Check size={11} />
                  프로필 동기화됨
                </p>
              ) : isWorkspaceLoading ? (
                <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" />
                  프로필 동기화 중…
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isAuthLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold disabled:opacity-60"
          >
            {isAuthLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <LogOut size={14} />
            )}
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  // 미로그인
  return (
    <div className="mx-4 mt-5">
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Cloud size={18} className="text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">서버 로그인</p>
            <p className="text-xs text-gray-500 mt-0.5">
              PC와 핸드폰에서 같은 데이터를 사용하려면 로그인하세요.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openAuthPanel}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold"
        >
          <LogIn size={14} />
          로그인하기
        </button>
      </div>
    </div>
  );
}
