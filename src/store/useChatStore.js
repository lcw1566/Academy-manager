// useChatStore
//
// 앱 내 채팅 상태 (학원 직원 전용).
//   - threads: 내가 접근 가능한 방 (학원 전체 단톡방 + 내 DM)
//   - messages: 학원 내 최근 메시지 (오래된 → 최신, 내 방만)
//   - reads: 내 읽음 기록 (thread_id → last_read_at)
//   - realtime: academy_chat_messages / academy_chat_threads insert 구독
//
// App.jsx 에서 로그인 + 학원 선택 후 loadChat / startChatRealtime 호출.
// useWorkspaceStore / useAcademyStore 와 독립적으로 동작한다 (가벼운 슬라이스).

import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  getOrCreateGroupThread,
  getOrCreateDmThread,
  listChatThreads,
  listChatMembers,
  listRecentChatMessages,
  sendChatMessage,
  markThreadRead,
  listMyChatReads,
} from '../services/supabase/chatApi';

const useChatStore = create((set, get) => ({
  academyId: null,
  threads: [],
  messages: [],
  members: [], // [{ user_id, display_name, email, role }] — 채팅 디렉터리
  reads: {}, // { [threadId]: last_read_at ISO }
  isLoading: false,
  loadedAt: null,
  realtimeChannel: null,
  realtimeTimer: null,

  // ─── load ──────────────────────────────────────────────────
  loadChat: async (academyId) => {
    if (!isSupabaseConfigured || !academyId) return;
    set({ isLoading: true, academyId });
    try {
      // 학원 전체 단톡방은 항상 존재하도록 보장.
      try { await getOrCreateGroupThread(academyId); } catch { /* 권한/일시 오류 무시 */ }

      const [threads, members, messages, reads] = await Promise.all([
        listChatThreads(academyId),
        listChatMembers(academyId),
        listRecentChatMessages(academyId, { limit: 400 }),
        listMyChatReads(),
      ]);
      const readsMap = {};
      (reads || []).forEach((r) => { readsMap[r.thread_id] = r.last_read_at; });
      set({
        threads: threads || [],
        members: members || [],
        messages: messages || [],
        reads: readsMap,
        loadedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[chat] loadChat failed', err);
    } finally {
      set({ isLoading: false });
    }
  },

  reloadThreads: async () => {
    const academyId = get().academyId;
    if (!academyId) return;
    try {
      const threads = await listChatThreads(academyId);
      set({ threads: threads || [] });
    } catch (err) {
      console.warn('[chat] reloadThreads failed', err);
    }
  },

  // 새 방(특히 갓 생성된 DM)의 메시지가 누락되지 않도록 방+최근 메시지 동시 갱신.
  reloadThreadsAndMessages: async () => {
    const academyId = get().academyId;
    if (!academyId) return;
    try {
      const [threads, messages] = await Promise.all([
        listChatThreads(academyId),
        listRecentChatMessages(academyId, { limit: 400 }),
      ]);
      set((s) => {
        // 기존 + 신규 메시지 병합 (id 기준 dedupe) — 낙관적 추가분 보존.
        const byId = new Map(s.messages.map((m) => [m.id, m]));
        (messages || []).forEach((m) => byId.set(m.id, m));
        const merged = Array.from(byId.values()).sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at),
        );
        return { threads: threads || [], messages: merged };
      });
    } catch (err) {
      console.warn('[chat] reloadThreadsAndMessages failed', err);
    }
  },

  // ─── send / read ───────────────────────────────────────────
  sendMessage: async ({ threadId, body }) => {
    const academyId = get().academyId;
    if (!academyId || !threadId) return null;
    const text = (body || '').trim();
    if (!text) return null;
    try {
      const created = await sendChatMessage({ academyId, threadId, body: text });
      if (created?.id) get().appendMessage(created);
      return created;
    } catch (err) {
      console.warn('[chat] sendMessage failed', err);
      throw err;
    }
  },

  // 중복 제거하며 메시지 추가 (insert 응답 + realtime 둘 다 도착할 수 있음).
  appendMessage: (msg) => {
    if (!msg?.id) return;
    set((s) => {
      if (s.messages.some((m) => m.id === msg.id)) return s;
      return { messages: [...s.messages, msg] };
    });
  },

  markRead: async (threadId) => {
    if (!threadId) return;
    // 낙관적 갱신 — 즉시 배지 제거.
    set((s) => ({ reads: { ...s.reads, [threadId]: new Date().toISOString() } }));
    try {
      await markThreadRead(threadId);
    } catch (err) {
      console.warn('[chat] markRead failed', err);
    }
  },

  // 상대와의 DM 방 확보 후 threadId 반환.
  openDm: async (otherUserId) => {
    const academyId = get().academyId;
    if (!academyId || !otherUserId) return null;
    const threadId = await getOrCreateDmThread(academyId, otherUserId);
    await get().reloadThreads();
    return threadId;
  },

  // group 방 id 확보.
  ensureGroupThread: async () => {
    const academyId = get().academyId;
    if (!academyId) return null;
    const existing = get().threads.find((t) => t.kind === 'group');
    if (existing) return existing.id;
    const id = await getOrCreateGroupThread(academyId);
    await get().reloadThreads();
    return id;
  },

  // ─── realtime ──────────────────────────────────────────────
  startChatRealtime: (academyId) => {
    if (!isSupabaseConfigured || !supabase || !academyId) return;
    get().stopChatRealtime();

    const channel = supabase
      .channel(`academy-chat:${academyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'academy_chat_messages',
          filter: `academy_id=eq.${academyId}`,
        },
        (payload) => {
          const row = payload?.new;
          if (!row) return;
          // RLS 는 realtime select 에도 적용되므로 내 방 메시지만 도달한다.
          const known = get().threads.some((t) => t.id === row.thread_id);
          if (known) {
            get().appendMessage(row);
          } else {
            // 아직 모르는 방(갓 생성된 DM 등) → 방+메시지 갱신.
            get().scheduleThreadsReload();
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'academy_chat_threads',
          filter: `academy_id=eq.${academyId}`,
        },
        () => get().scheduleThreadsReload(),
      );

    channel.subscribe();
    set({ realtimeChannel: channel });
  },

  scheduleThreadsReload: () => {
    const prev = get().realtimeTimer;
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      set({ realtimeTimer: null });
      get().reloadThreadsAndMessages();
    }, 300);
    set({ realtimeTimer: t });
  },

  stopChatRealtime: () => {
    const channel = get().realtimeChannel;
    if (channel && supabase) {
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
    }
    const t = get().realtimeTimer;
    if (t) clearTimeout(t);
    set({ realtimeChannel: null, realtimeTimer: null });
  },

  clearChat: () => {
    get().stopChatRealtime();
    set({ academyId: null, threads: [], messages: [], members: [], reads: {}, loadedAt: null });
  },
}));

// ─── selectors (컴포넌트에서 호출) ──────────────────────────────
// 한 방의 안 읽은 메시지 수 (내가 보낸 건 제외, last_read_at 이후).
export function unreadCountForThread(state, threadId, myUserId) {
  const lastRead = state.reads[threadId];
  const lastMs = lastRead ? new Date(lastRead).getTime() : 0;
  return state.messages.filter(
    (m) =>
      m.thread_id === threadId &&
      m.sender_id !== myUserId &&
      new Date(m.created_at).getTime() > lastMs,
  ).length;
}

export function totalUnread(state, myUserId) {
  if (!myUserId) return 0;
  const byThread = {};
  state.messages.forEach((m) => {
    if (m.sender_id === myUserId) return;
    const lastRead = state.reads[m.thread_id];
    const lastMs = lastRead ? new Date(lastRead).getTime() : 0;
    if (new Date(m.created_at).getTime() > lastMs) {
      byThread[m.thread_id] = (byThread[m.thread_id] || 0) + 1;
    }
  });
  return Object.values(byThread).reduce((a, b) => a + b, 0);
}

export default useChatStore;
