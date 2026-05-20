// StaffInviteWidget
//
// Phase 19 — 원장이 강사/보조강사를 이메일로 초대하는 위젯.
// TeacherFormModal / AssistantFormModal 에 끼워 넣어 쓴다.
//
// 흐름:
//   1) 원장이 이메일 입력
//   2) "계정 검색" → findProfileByEmail (best-effort; RLS 차단 가능)
//   3) "초대 보내기" → createAcademyInvitation (pending row 생성)
//   4) 강사/보조강사가 본인 로그인 후 받은 초대 영역에서 수락
//
// 안전 가드:
//   - 본인이 본인을 초대하는 케이스 차단 (원장 == 입력 이메일)
//   - 이메일은 lowercase trim 후 비교/전송
//   - 이메일 발송은 이번 단계에서 하지 않음 (원장이 카톡/문자로 직접 전달)
import { useEffect, useState } from 'react';
import { Mail, Search, Send, Loader2, Check, Info } from 'lucide-react';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  findProfileByEmail,
  createAcademyInvitation,
  listAcademyInvitations,
} from '../../../services/supabase/workspaceApi';

const ROLE_LABEL = { teacher: '강사', assistant: '보조강사' };

function normalizeEmail(value) {
  return (value ?? '').trim().toLowerCase();
}

export default function StaffInviteWidget({
  role,            // 'teacher' | 'assistant'
  initialEmail,    // 폼에 기존에 저장된 이메일 (있으면 prefill)
  onEmailChange,   // 폼에 이메일 값을 다시 반영 (저장 시 함께 persist)
  onInviteSent,    // 초대 row 생성 시 inviteStatus='pending' 등 폼에 반영
}) {
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const myEmail = useAuthStore((s) => s.user?.email);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [email, setEmail] = useState(initialEmail || '');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null); // 'found' | 'unknown' | null
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null); // {type:'success'|'error'|'info', text}
  const [existingInvite, setExistingInvite] = useState(null);

  // 폼 prefill 이 바뀌면 따라가도록 (수정 시작 시 등)
  useEffect(() => {
    setEmail(initialEmail || '');
    setSearchResult(null);
    setFeedback(null);
    setExistingInvite(null);
  }, [initialEmail]);

  // 학원에 이미 같은 (email, role) 의 invitation 이 있는지 조회 (정보용)
  useEffect(() => {
    if (!currentAcademyId || !isAuthenticated) return;
    const cleaned = normalizeEmail(initialEmail || '');
    if (!cleaned) {
      setExistingInvite(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await listAcademyInvitations(currentAcademyId);
        if (cancelled) return;
        const match = list.find(
          (inv) => normalizeEmail(inv.email) === cleaned && inv.role === role,
        );
        setExistingInvite(match || null);
      } catch {
        // 정책 차단 등은 무시 — 폼 동작에는 영향 없음
      }
    })();
    return () => { cancelled = true; };
  }, [currentAcademyId, isAuthenticated, initialEmail, role]);

  const cleanedEmail = normalizeEmail(email);
  const isMyOwnEmail =
    !!cleanedEmail && !!myEmail && cleanedEmail === normalizeEmail(myEmail);

  const handleChange = (value) => {
    setEmail(value);
    setSearchResult(null);
    setFeedback(null);
    onEmailChange?.(value);
  };

  const handleSearch = async () => {
    setFeedback(null);
    if (!cleanedEmail) {
      setFeedback({ type: 'error', text: '이메일을 입력해주세요.' });
      return;
    }
    if (isMyOwnEmail) {
      setFeedback({ type: 'error', text: '본인 계정은 초대할 수 없어요.' });
      return;
    }
    setSearching(true);
    try {
      const profile = await findProfileByEmail(cleanedEmail);
      if (profile) {
        setSearchResult('found');
        setFeedback({
          type: 'info',
          text: '가입된 계정을 찾았어요. 초대를 보내면 상대가 수락 후 학원에 참여합니다.',
        });
      } else {
        // RLS 가 다른 사용자 profile 조회를 차단하므로 대부분 여기에 떨어진다.
        setSearchResult('unknown');
        setFeedback({
          type: 'info',
          text:
            '아직 가입하지 않은 이메일이거나 검색이 제한된 이메일이에요. ' +
            '초대를 만들어두면 해당 이메일로 가입 후 수락할 수 있어요.',
        });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: err?.message ?? '계정 검색에 실패했어요.' });
    } finally {
      setSearching(false);
    }
  };

  const handleInvite = async () => {
    setFeedback(null);
    if (!currentAcademyId) {
      setFeedback({ type: 'error', text: '학원을 먼저 선택해주세요.' });
      return;
    }
    if (!cleanedEmail) {
      setFeedback({ type: 'error', text: '이메일을 입력해주세요.' });
      return;
    }
    if (isMyOwnEmail) {
      setFeedback({ type: 'error', text: '본인 계정은 초대할 수 없어요.' });
      return;
    }
    setSending(true);
    try {
      const inv = await createAcademyInvitation({
        academyId: currentAcademyId,
        email: cleanedEmail,
        role,
      });
      setExistingInvite(inv);
      setFeedback({
        type: 'success',
        text:
          '초대를 만들었어요. ' +
          '카톡/문자로 상대에게 회원가입 또는 로그인 후 수락하도록 안내해주세요.',
      });
      onInviteSent?.({ email: cleanedEmail, status: inv.status });
    } catch (err) {
      setFeedback({ type: 'error', text: err?.message ?? '초대 생성에 실패했어요.' });
    } finally {
      setSending(false);
    }
  };

  const inviteStatusLabel = existingInvite?.status
    ? existingInvite.status === 'accepted'
      ? '초대 수락됨'
      : existingInvite.status === 'pending'
      ? '초대 대기 중'
      : '초대 취소됨'
    : null;
  const inviteStatusTone =
    existingInvite?.status === 'accepted'
      ? 'bg-emerald-50 text-emerald-700'
      : existingInvite?.status === 'pending'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-gray-100 text-gray-500';

  if (!isAuthenticated) {
    // 미로그인 상태에서는 위젯 자체를 숨김 (Supabase 호출 의미 없음)
    return (
      <div className="rounded-2xl bg-gray-50 px-3 py-3 text-xs text-gray-500 flex items-start gap-2">
        <Info size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
        <span>
          서버 계정 연결 후 강사/보조강사 초대를 보낼 수 있어요.
          상단 “서버 계정” 영역에서 로그인해주세요.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
        <Mail size={12} className="text-gray-400" />
        계정 이메일
      </label>
      <div className="flex gap-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="staff@example.com"
          className="input flex-1"
        />
      </div>

      {/* 현재 invitation 상태 표시 */}
      {inviteStatusLabel && (
        <div className={`text-xs font-semibold rounded-xl px-3 py-2 ${inviteStatusTone}`}>
          {ROLE_LABEL[role]} {inviteStatusLabel}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || !cleanedEmail || isMyOwnEmail}
          className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          계정 검색
        </button>
        <button
          type="button"
          onClick={handleInvite}
          disabled={sending || !cleanedEmail || isMyOwnEmail || !currentAcademyId}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          초대 보내기
        </button>
      </div>

      {/* 안내 / 결과 메시지 */}
      {feedback && (
        <div
          className={`text-xs rounded-xl px-3 py-2.5 leading-relaxed ${
            feedback.type === 'error'
              ? 'bg-red-50 text-red-600'
              : feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-blue-50 text-blue-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {!feedback && searchResult === 'found' && (
        <div className="text-xs rounded-xl px-3 py-2.5 bg-blue-50 text-blue-700 flex items-start gap-2">
          <Check size={12} className="mt-0.5 flex-shrink-0" />
          <span>가입된 계정이 확인됐어요. “초대 보내기” 를 눌러 학원에 합류하도록 요청하세요.</span>
        </div>
      )}

      <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
        초대 이메일 자동 발송은 아직 지원되지 않아요.
        원장이 카톡/문자로 가입 또는 로그인 안내를 직접 전달해주세요.
      </p>
    </div>
  );
}
