import { supabase } from "../../lib/supabase";

// UI visibility only. The Edge Function independently enforces the project,
// verified caller, registered target UUIDs and synthetic academy isolation.
export const isStagingTestLogin =
  import.meta.env.VITE_SUPABASE_URL ===
  "https://owitlzsgxxuthgbmweyt.supabase.co";

export async function getTestLoginContext() {
  if (!isStagingTestLogin) return null;
  const { data, error } = await supabase.functions.invoke(
    "staging-test-login",
    { method: "GET" },
  );
  if (error) {
    if ([401, 403, 404].includes(error.context?.status)) return null;
    throw new Error("테스트 계정 목록을 불러오지 못했어요. 새로고침해주세요.");
  }
  return data;
}

export async function requestTestLogin(persona) {
  const { data, error } = await supabase.functions.invoke(
    "staging-test-login",
    { body: { persona } },
  );
  if (error || !data?.access_token || !data?.refresh_token) {
    throw new Error(
      error?.context?.status === 429
        ? "전환 요청이 많아요. 1분 후 다시 시도해주세요."
        : "테스트 계정을 전환하지 못했어요. 잠시 후 다시 시도해주세요.",
    );
  }
  return data;
}
