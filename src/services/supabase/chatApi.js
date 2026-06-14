// chatApi.js
//
// 앱 내 채팅 (학원 직원 전용) Supabase 래퍼.
//   - 방 확보는 security-definer RPC 로 경쟁/중복 없이 처리.
//   - 메시지 select/insert, 읽음 표시(upsert) 는 RLS 로 본인 접근 범위만 허용.
//
// 스키마: supabase/sql/019_academy_chat.sql

import { supabase, isSupabaseConfigured } from '../../lib/supabase';

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase가 설정되지 않았어요. .env.local을 확인해주세요.');
  }
}

async function getCurrentUserOrThrow() {
  assertSupabaseConfigured();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error('로그인이 필요해요.');
  return data.user;
}

// 학원 전체 단톡방 id 확보 (없으면 생성).
export async function getOrCreateGroupThread(academyId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase.rpc('get_or_create_group_thread', {
    p_academy_id: academyId,
  });
  if (error) throw error;
  return data; // uuid
}

// 상대 직원과의 1:1 DM 방 id 확보 (없으면 생성).
export async function getOrCreateDmThread(academyId, otherUserId) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!otherUserId) throw new Error('상대를 선택해주세요.');
  const { data, error } = await supabase.rpc('get_or_create_dm_thread', {
    p_academy_id: academyId,
    p_other_user_id: otherUserId,
  });
  if (error) throw error;
  return data; // uuid
}

// 선택한 직원들과 새 단톡방 생성.
export async function createGroupChatThread(academyId, { title, memberUserIds = [] } = {}) {
  assertSupabaseConfigured();
  if (!academyId) throw new Error('academyId가 필요해요.');
  const { data, error } = await supabase.rpc('create_group_chat_thread', {
    p_academy_id: academyId,
    p_title: title,
    p_member_user_ids: memberUserIds,
  });
  if (error) throw error;
  return data; // uuid
}

// 채팅용 멤버 디렉터리 — 학원 멤버 누구나 활성 직원 명단 조회 (이름/role).
export async function listChatMembers(academyId) {
  assertSupabaseConfigured();
  if (!academyId) return [];
  const { data, error } = await supabase.rpc('list_academy_chat_members', {
    p_academy_id: academyId,
  });
  if (error) throw error;
  return data || [];
}

// 내가 접근 가능한 방 목록 (group + 내 DM). RLS 가 가시성 필터링.
export async function listChatThreads(academyId) {
  assertSupabaseConfigured();
  if (!academyId) return [];
  const { data, error } = await supabase
    .from('academy_chat_threads')
    .select('*')
    .eq('academy_id', academyId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// 학원 내 최근 메시지 (RLS 로 내 방 메시지만 반환). 방 목록 미리보기/안읽음 계산용.
export async function listRecentChatMessages(academyId, { limit = 400 } = {}) {
  assertSupabaseConfigured();
  if (!academyId) return [];
  const { data, error } = await supabase
    .from('academy_chat_messages')
    .select('*')
    .eq('academy_id', academyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).reverse(); // 오래된 → 최신
}

// 한 방의 메시지 (오래된 → 최신).
export async function listThreadMessages(threadId, { limit = 300 } = {}) {
  assertSupabaseConfigured();
  if (!threadId) return [];
  const { data, error } = await supabase
    .from('academy_chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).reverse();
}

export async function sendChatMessage({ academyId, threadId, body }) {
  const user = await getCurrentUserOrThrow();
  if (!academyId) throw new Error('academyId가 필요해요.');
  if (!threadId) throw new Error('threadId가 필요해요.');
  const text = (body || '').trim();
  if (!text) throw new Error('메시지를 입력해주세요.');
  const { data, error } = await supabase
    .from('academy_chat_messages')
    .insert({
      academy_id: academyId,
      thread_id: threadId,
      sender_id: user.id,
      body: text.slice(0, 4000),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 방을 읽음 처리 (last_read_at = now).
export async function markThreadRead(threadId) {
  const user = await getCurrentUserOrThrow();
  if (!threadId) return null;
  const { data, error } = await supabase
    .from('academy_chat_reads')
    .upsert(
      { thread_id: threadId, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: 'thread_id,user_id' },
    )
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 내 읽음 기록 (RLS 로 본인 것만 반환).
export async function listMyChatReads() {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from('academy_chat_reads')
    .select('*');
  if (error) throw error;
  return data || [];
}
