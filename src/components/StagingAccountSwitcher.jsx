import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import useAuthStore from "../store/useAuthStore";
import useWorkspaceStore from "../store/useWorkspaceStore";
import useAcademyStore from "../store/useAcademyStore";
import useDeveloperStore from "../store/useDeveloperStore";
import useChatStore from "../store/useChatStore";
import {
  getTestLoginContext,
  isStagingTestLogin,
  requestTestLogin,
} from "../services/supabase/testLoginApi";
import { disableCurrentPushDevice } from "../services/pushNotifications";

const labels = {
  owner: "원장",
  manager: "운영 매니저",
  teacher: "선생님",
  invited: "초대 대기",
};

function clearAccountData() {
  useWorkspaceStore.getState().clearWorkspace();
  useWorkspaceStore.getState().setWorkspacePicked(false);
  useAcademyStore.getState().clearAcademyDataCache();
  useChatStore.getState().clearChat();
  useDeveloperStore.getState().clear();
}

export default function StagingAccountSwitcher({
  expanded = false,
  className = "",
}) {
  const userId = useAuthStore((s) => s.user?.id);
  const [context, setContext] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setContext(null);
    setError("");
    if (userId && isStagingTestLogin) {
      getTestLoginContext()
        .then((next) => {
          if (current) setContext(next);
        })
        .catch((err) => {
          if (current) setError(err.message);
        });
    }
    return () => {
      current = false;
    };
  }, [userId]);

  const switchAccount = async (persona) => {
    if (busy || persona === context.current_persona) return;
    setBusy(true);
    setError("");
    try {
      // Do not cross the account boundary while this browser's old push device
      // is still enabled. A failed cleanup leaves the current login intact.
      await disableCurrentPushDevice();
      const session = await requestTestLogin(persona);
      await useAuthStore.getState().signOutUser();
      clearAccountData();
      const { error: loginError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      if (loginError)
        throw new Error(
          "로그인에 실패했어요. 로그인 화면에서 다시 접속해주세요.",
        );
      // Reload terminates all in-flight old-account snapshots and realtime
      // subscriptions. No test password is ever delivered to the browser.
      clearAccountData();
      window.location.reload();
    } catch (err) {
      const message = err.message || "계정을 전환하지 못했어요.";
      setError(message);
      useAcademyStore.getState().showToast(message, "error");
      setBusy(false);
    }
  };

  if (!isStagingTestLogin || (!context && !error)) return null;
  if (!context)
    return (
      <p role="status" className={`text-xs text-seenit-secondary ${className}`}>
        {error}
      </p>
    );
  return (
    <details
      open={expanded || undefined}
      className={`rounded-2xl border border-seenit-border bg-seenit-surface p-3 text-seenit-ink ${className}`}
    >
      <summary className="cursor-pointer rounded-lg text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-seenit-brand">
        테스트 계정 전환 · 현재 {labels[context.current_persona]}
      </summary>
      <p className="mt-2 text-xs leading-5 text-seenit-secondary">
        별도 계정으로 로그인해요. 전환 후 학원을 선택해주세요. 저장하지 않은
        입력은 사라져요.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2" aria-busy={busy}>
        {context.accounts.map((account) => (
          <button
            key={account.persona}
            type="button"
            disabled={busy || account.user_id === userId}
            onClick={() => switchAccount(account.persona)}
            className="pressable-surface min-w-0 rounded-xl border border-seenit-border bg-seenit-control p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-seenit-brand disabled:opacity-60"
          >
            <span className="block text-sm font-semibold">
              {labels[account.persona]} 계정
              {account.user_id === userId ? " · 사용 중" : "으로 전환"}
            </span>
            <span className="mt-1 block break-all text-xs text-seenit-secondary">
              {account.email}
            </span>
          </button>
        ))}
      </div>
      {busy && (
        <p role="status" className="mt-2 text-xs text-seenit-secondary">
          계정을 전환하고 있어요…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-seenit-danger">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-seenit-secondary">
        등록된 스테이징 테스트 계정만 전환할 수 있고 이력이 남아요. 개인 권한은
        원장 계정의 직원 화면에서 설정하세요. 채팅·알림을 동시에 비교하려면 서로
        다른 브라우저 프로필을 사용하세요.
      </p>
    </details>
  );
}
