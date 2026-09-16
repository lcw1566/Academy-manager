import { supabase } from "../../lib/supabase";

// Share only simultaneous requests. Never retain permissions across refreshes,
// account switches, or permission edits; RLS/read RPCs still enforce each read.
const pending = new Map();
export async function getAcademySyncAccess(academyId) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data?.session?.user?.id;
  if (!userId) throw new Error("로그인이 필요해요.");
  const key = `${userId}:${academyId}`;
  if (pending.has(key)) return pending.get(key);
  const request = (async () => {
    const { data: access, error: accessError } = await supabase.rpc(
      "get_my_academy_sync_access",
      {
        p_academy_id: academyId,
      },
    );
    if (accessError) throw accessError;
    return access;
  })();
  pending.set(key, request);
  try {
    return await request;
  } finally {
    if (pending.get(key) === request) pending.delete(key);
  }
}
