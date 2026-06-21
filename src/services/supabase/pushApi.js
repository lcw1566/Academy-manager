import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export async function upsertPushDevice({ token, platform, provider }) {
  if (!isSupabaseConfigured || !supabase || !token) return null;
  const { data, error } = await supabase.rpc('register_push_device', {
    p_token: token,
    p_platform: platform,
    p_provider: provider,
  });
  if (error) throw error;
  return data;
}

export async function disablePushDevice(token, provider) {
  if (!isSupabaseConfigured || !supabase || !token) return;
  const { error } = await supabase
    .from('push_devices')
    .update({ enabled: false })
    .eq('token', token)
    .eq('provider', provider);
  if (error) throw error;
}

// 채팅 저장 성공과 푸시 발송을 분리한다. 함수가 아직 배포되지 않았거나
// 외부 인증키가 없어도 메시지 전송 자체는 성공해야 한다.
export async function requestChatPush(messageId) {
  if (!isSupabaseConfigured || !supabase || !messageId) return;
  const { error } = await supabase.functions.invoke('chat-push', {
    body: { messageId },
  });
  if (error) throw error;
}
