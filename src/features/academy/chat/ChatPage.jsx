import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronLeft, Send, Users, Megaphone, Search, Check, Loader2 } from 'lucide-react';
import useChatStore, { unreadCountForThread } from '../../../store/useChatStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import useAcademyStore from '../../../store/useAcademyStore';
import Header from '../../../components/Header';
import EmptyState from '../../../components/EmptyState';

const ROLE_LABELS = { owner: '원장', teacher: '강사', assistant: '보조강사' };

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const hh = h % 12 || 12;
  return `${ampm} ${hh}:${String(m).padStart(2, '0')}`;
}

function formatThreadStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return formatTime(iso);
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default function ChatPage() {
  const authUserId = useAuthStore((s) => s.user?.id);
  const threads = useChatStore((s) => s.threads);
  const messages = useChatStore((s) => s.messages);
  const reads = useChatStore((s) => s.reads);
  // 채팅 디렉터리 — 모든 학원 멤버가 조회 가능한 RPC 기반(useChatStore.members).
  // 보조 fallback 으로 워크스페이스 프로필(원장만 채워짐)도 병합.
  const chatMembers = useChatStore((s) => s.members);
  const chatAcademyId = useChatStore((s) => s.academyId);
  const loadChat = useChatStore((s) => s.loadChat);
  const academyMemberProfiles = useWorkspaceStore((s) => s.academyMemberProfiles) ?? [];
  const academyStaffProfiles = useWorkspaceStore((s) => s.academyStaffProfiles) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);

  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  // 채팅 탭을 열 때 직접 로드 — 전역 effect 타이밍에 의존하지 않는다.
  // (현재 학원에 대해 아직 로드 안 됐으면 1회 로드.)
  useEffect(() => {
    if (currentAcademyId && chatAcademyId !== currentAcademyId) {
      loadChat(currentAcademyId);
    }
  }, [currentAcademyId, chatAcademyId, loadChat]);

  // user_id → { name, role, email }
  const memberMap = useMemo(() => {
    const map = {};
    chatMembers.forEach((m) => {
      map[m.user_id] = { name: m.display_name || m.email || '직원', email: m.email, role: m.role };
    });
    academyMemberProfiles.forEach((mp) => {
      if (!map[mp.user_id]) map[mp.user_id] = { name: mp.display_name || mp.email || '직원', email: mp.email };
    });
    academyStaffProfiles.forEach((sp) => {
      if (!map[sp.user_id]) map[sp.user_id] = { name: sp.display_name || '직원' };
      if (!map[sp.user_id].role) map[sp.user_id].role = sp.role;
    });
    return map;
  }, [chatMembers, academyMemberProfiles, academyStaffProfiles]);

  const threadTitle = (thread) => {
    if (!thread) return '';
    if (thread.kind === 'group') {
      if (thread.group_scope === 'custom') return thread.title || '단톡방';
      return thread.title || '학원 전체';
    }
    const otherId = thread.dm_user_a === authUserId ? thread.dm_user_b : thread.dm_user_a;
    return memberMap[otherId]?.name || '직원';
  };

  // 방별 마지막 메시지.
  const lastMsgByThread = useMemo(() => {
    const map = {};
    messages.forEach((m) => {
      const prev = map[m.thread_id];
      if (!prev || new Date(m.created_at) > new Date(prev.created_at)) map[m.thread_id] = m;
    });
    return map;
  }, [messages]);

  // 정렬: group 항상 최상단, 그 다음 마지막 메시지 최신순.
  const sortedThreads = useMemo(() => {
    const arr = [...threads];
    arr.sort((a, b) => {
      if (a.kind === 'group' && b.kind !== 'group') return -1;
      if (b.kind === 'group' && a.kind !== 'group') return 1;
      const am = lastMsgByThread[a.id]?.created_at || a.updated_at || a.created_at;
      const bm = lastMsgByThread[b.id]?.created_at || b.updated_at || b.created_at;
      return new Date(bm) - new Date(am);
    });
    return arr;
  }, [threads, lastMsgByThread]);

  const selectedThread = threads.find((t) => t.id === selectedThreadId) || null;

  if (selectedThread) {
    return (
      <ChatRoom
        thread={selectedThread}
        title={threadTitle(selectedThread)}
        memberMap={memberMap}
        authUserId={authUserId}
        onBack={() => setSelectedThreadId(null)}
      />
    );
  }

  return (
    <div>
      <Header
        title="채팅"
        right={
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowPicker(true)}
            className="h-9 w-9 md:w-auto md:px-4 flex items-center justify-center gap-1.5 rounded-xl bg-[#0064FF] text-white text-sm font-bold shadow-sm active:bg-[#0050CC]"
          >
            <Plus size={16} />
            <span className="hidden md:inline">새 대화</span>
          </motion.button>
        }
      />

      <div className="pt-14 md:pt-0 pb-6">
        {sortedThreads.length === 0 ? (
          <EmptyState
            icon="💬"
            title="아직 대화가 없어요"
            description="+ 버튼으로 직원과 1:1 대화를 시작해보세요."
          />
        ) : (
          <div className="px-3 pt-3 flex flex-col gap-1">
            {sortedThreads.map((thread) => {
              const last = lastMsgByThread[thread.id];
              const unread = unreadCountForThread({ messages, reads }, thread.id, authUserId);
              const isGroup = thread.kind === 'group';
              const isAcademyGroup = isGroup && thread.group_scope !== 'custom';
              const senderName = last
                ? (last.sender_id === authUserId ? '나' : (memberMap[last.sender_id]?.name || '직원'))
                : null;
              return (
                <motion.button
                  key={thread.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedThreadId(thread.id)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl active:bg-gray-50 text-left"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${isGroup ? 'bg-blue-50' : 'bg-gray-100'}`}>
                    {isGroup
                      ? <Megaphone size={20} className="text-[#0064FF]" />
                      : <span className="text-base font-bold text-gray-500">{(threadTitle(thread)[0] || '?')}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900 truncate">{threadTitle(thread)}</p>
                      {isGroup && <span className="text-[10px] text-[#0064FF] font-semibold flex-shrink-0">{isAcademyGroup ? '전체' : '단톡'}</span>}
                      <span className="ml-auto text-[11px] text-gray-400 flex-shrink-0">
                        {last ? formatThreadStamp(last.created_at) : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-500 truncate flex-1">
                        {last
                          ? `${isGroup && senderName ? `${senderName}: ` : ''}${last.body}`
                          : '대화를 시작해보세요'}
                      </p>
                      {unread > 0 && (
                        <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#0064FF] text-white text-[10px] font-bold flex items-center justify-center">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {showPicker && (
        <MemberPickerSheet
          memberMap={memberMap}
          authUserId={authUserId}
          academyId={currentAcademyId}
          onClose={() => setShowPicker(false)}
          onPicked={(threadId) => { setShowPicker(false); setSelectedThreadId(threadId); }}
        />
      )}
    </div>
  );
}

// ─── 대화방 ─────────────────────────────────────────────────────
function ChatRoom({ thread, title, memberMap, authUserId, onBack }) {
  const messages = useChatStore((s) => s.messages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const markRead = useChatStore((s) => s.markRead);
  const showToast = useAcademyStore((s) => s.showToast);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const isGroup = thread.kind === 'group';
  const isAcademyGroup = isGroup && thread.group_scope !== 'custom';

  const threadMessages = useMemo(
    () => messages
      .filter((m) => m.thread_id === thread.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [messages, thread.id],
  );

  // 방 진입 + 새 메시지 도착 시 읽음 처리 & 맨 아래로 스크롤.
  useEffect(() => {
    markRead(thread.id);
  }, [thread.id, threadMessages.length, markRead]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [threadMessages.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setSending(true);
    try {
      await sendMessage({ threadId: thread.id, body: text });
    } catch (err) {
      setDraft(text); // 실패 시 입력 복원
      showToast?.(err?.message ? `메시지 전송 실패: ${err.message}` : '메시지를 보내지 못했어요.', 'error');
    } finally {
      setSending(false);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col h-[100dvh] bg-[#F2F4F6]">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-2 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-100">
          <ChevronLeft size={22} className="text-gray-700" />
        </button>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isGroup ? 'bg-blue-50' : 'bg-gray-100'}`}>
          {isGroup
            ? <Megaphone size={16} className="text-[#0064FF]" />
            : <span className="text-sm font-bold text-gray-500">{title[0] || '?'}</span>}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate leading-tight">{title}</p>
          {isGroup && (
            <p className="text-[11px] text-gray-400 flex items-center gap-1">
              <Users size={10} /> {isAcademyGroup ? '학원 전체 직원' : '선택한 직원 단톡방'}
            </p>
          )}
        </div>
      </div>

      {/* 메시지 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
        {threadMessages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="text-4xl mb-2">👋</div>
            <p className="text-sm text-gray-400">첫 메시지를 보내보세요</p>
          </div>
        )}
        {threadMessages.map((m, idx) => {
          const mine = m.sender_id === authUserId;
          const prev = threadMessages[idx - 1];
          const showSender = isGroup && !mine && (!prev || prev.sender_id !== m.sender_id);
          const senderName = memberMap[m.sender_id]?.name || '직원';
          const senderRole = memberMap[m.sender_id]?.role;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              {showSender && (
                <p className="text-[11px] text-gray-500 font-medium mb-0.5 ml-1">
                  {senderName}
                  {senderRole ? ` · ${ROLE_LABELS[senderRole] || ''}` : ''}
                </p>
              )}
              <div className={`flex items-end gap-1.5 max-w-[80%] ${mine ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    mine
                      ? 'bg-[#0064FF] text-white rounded-br-md'
                      : 'bg-white text-gray-900 rounded-bl-md shadow-sm'
                  }`}
                >
                  {m.body}
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0 mb-0.5">{formatTime(m.created_at)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 입력 */}
      <div className="flex items-end gap-2 px-3 py-3 bg-white border-t border-gray-100 flex-shrink-0">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder="메시지 입력"
          className="flex-1 resize-none max-h-32 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            draft.trim() && !sending ? 'bg-[#0064FF] text-white' : 'bg-gray-200 text-gray-400'
          }`}
        >
          <Send size={17} />
        </motion.button>
      </div>
    </div>,
    document.body,
  );
}

// ─── DM 상대 선택 ───────────────────────────────────────────────
function MemberPickerSheet({ memberMap, authUserId, academyId, onClose, onPicked }) {
  const openDm = useChatStore((s) => s.openDm);
  const createGroup = useChatStore((s) => s.createGroup);
  const showToast = useAcademyStore((s) => s.showToast);
  const [mode, setMode] = useState('dm');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  const candidates = useMemo(() => {
    const list = Object.entries(memberMap)
      .filter(([uid]) => uid !== authUserId)
      .map(([uid, info]) => ({ uid, ...info }));
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter((m) => (m.name || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q))
      : list;
    return filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  }, [memberMap, authUserId, query]);

  const pick = async (uid) => {
    if (busyId) return;
    setBusyId(uid);
    try {
      const threadId = await openDm(uid, academyId);
      if (threadId) {
        onPicked(threadId);
      } else {
        showToast?.('대화방을 열지 못했어요. 잠시 후 다시 시도해주세요.', 'error');
        setBusyId(null);
      }
    } catch (err) {
      console.warn('[chat] openDm failed', err);
      showToast?.(err?.message ? `대화 시작 실패: ${err.message}` : '대화를 시작하지 못했어요.', 'error');
      setBusyId(null);
    }
  };

  const toggleMember = (uid) => {
    setSelectedIds((prev) => (
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    ));
  };

  const createSelectedGroup = async () => {
    if (creatingGroup) return;
    if (selectedIds.length < 2) {
      showToast?.('단톡방은 나를 제외하고 2명 이상 선택해주세요.', 'error');
      return;
    }
    const title = groupTitle.trim()
      || selectedIds.map((id) => memberMap[id]?.name).filter(Boolean).slice(0, 3).join(', ');
    setCreatingGroup(true);
    try {
      const threadId = await createGroup({
        title,
        memberUserIds: selectedIds,
        academyId,
      });
      if (threadId) {
        onPicked(threadId);
      } else {
        showToast?.('단톡방을 만들지 못했어요. 잠시 후 다시 시도해주세요.', 'error');
        setCreatingGroup(false);
      }
    } catch (err) {
      console.warn('[chat] createGroup failed', err);
      showToast?.(err?.message ? `단톡방 생성 실패: ${err.message}` : '단톡방을 만들지 못했어요.', 'error');
      setCreatingGroup(false);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      <motion.div
        key="dim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />
      <motion.div
        key="sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-4 pt-5 pb-8 max-h-[80vh] flex flex-col"
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <p className="text-base font-bold text-gray-900 mb-3">새 대화</p>

        <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1 mb-3">
          <button
            type="button"
            onClick={() => setMode('dm')}
            className={`h-9 rounded-lg text-sm font-bold transition-colors ${mode === 'dm' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            1:1
          </button>
          <button
            type="button"
            onClick={() => setMode('group')}
            className={`h-9 rounded-lg text-sm font-bold transition-colors ${mode === 'group' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            단톡
          </button>
        </div>

        {mode === 'group' && (
          <input
            value={groupTitle}
            onChange={(e) => setGroupTitle(e.target.value)}
            placeholder="단톡방 이름"
            maxLength={80}
            className="w-full bg-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none mb-3"
          />
        )}

        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 검색"
            className="w-full bg-gray-100 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">대화할 직원이 없어요</p>
          ) : (
            <div className="flex flex-col gap-1">
              {candidates.map((m) => (
                <motion.button
                  key={m.uid}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => (mode === 'dm' ? pick(m.uid) : toggleMember(m.uid))}
                  disabled={!!busyId || creatingGroup}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-2xl active:bg-gray-50 text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-gray-500">{(m.name || '?')[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{m.name}</p>
                    {m.role && <p className="text-xs text-gray-400">{ROLE_LABELS[m.role] || ''}</p>}
                  </div>
                  {busyId === m.uid && <span className="text-xs text-gray-400">여는 중…</span>}
                  {mode === 'group' && (
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      selectedIds.includes(m.uid) ? 'bg-[#0064FF] text-white' : 'bg-gray-100 text-transparent'
                    }`}>
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {mode === 'group' && (
          <button
            type="button"
            onClick={createSelectedGroup}
            disabled={creatingGroup || selectedIds.length < 2}
            className={`mt-4 h-12 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold transition-colors ${
              selectedIds.length >= 2 && !creatingGroup
                ? 'bg-[#0064FF] text-white active:bg-[#0050CC]'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {creatingGroup && <Loader2 size={16} className="animate-spin" />}
            {selectedIds.length > 0 ? `${selectedIds.length + 1}명 단톡방 만들기` : '단톡방 만들기'}
          </button>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
