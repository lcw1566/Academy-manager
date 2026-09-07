import { isSupabaseConfigured, supabase } from '../../lib/supabase';

const READ_STATE_TIMEOUT_MS = 5000;

async function runReadStateQuery(buildQuery) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), READ_STATE_TIMEOUT_MS);
  try {
    const result = await buildQuery(controller.signal);
    if (controller.signal.aborted) {
      throw new Error('업데이트 확인 상태 동기화 시간이 초과됐어요.');
    }
    return result;
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new Error('업데이트 확인 상태 동기화 시간이 초과됐어요.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function currentUserId() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.user?.id || null;
}

export async function listReadProductUpdateIds(updateIds = []) {
  const ids = [...new Set(updateIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const userId = await currentUserId();
  if (!userId) return [];

  const { data, error } = await runReadStateQuery((signal) => supabase
    .from('product_update_reads')
    .select('update_id')
    .eq('user_id', userId)
    .in('update_id', ids)
    .abortSignal(signal));
  if (error) throw error;
  return (data || []).map((row) => row.update_id).filter(Boolean);
}

export async function markProductUpdateRead(updateId) {
  if (!updateId) return;
  const userId = await currentUserId();
  if (!userId) return;

  const { error } = await runReadStateQuery((signal) => supabase
    .from('product_update_reads')
    .upsert(
      {
        user_id: userId,
        update_id: updateId,
        read_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,update_id' },
    )
    .abortSignal(signal));
  if (error) throw error;
}
