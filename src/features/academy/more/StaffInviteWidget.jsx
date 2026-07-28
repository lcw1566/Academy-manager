// StaffInviteWidget
//
// 원장 또는 운영 매니저가 직원을 "앱 내부 초대" 로 부르는 위젯.
//
// 이메일은 **계정 식별자** 일 뿐, 실제 메일은 발송되지 않는다.
// 초대는 academy_invitations 테이블에 pending row 로 저장되며,
// 해당 이메일로 로그인한 사용자의 워크스페이스에 "받은 초대" 로 표시된다.
//
// 흐름:
//   1) 원장이 이메일 입력
//   2) "계정 검색" → findProfileByEmail (best-effort; RLS 차단 가능)
//   3) 역할 선택 후 "앱 초대 보내기" → createAcademyInvitation
//   4) 직원이 같은 이메일로 로그인한 뒤 "받은 초대" 에서 수락
//   5) 수락 즉시 선택한 역할로 학원 접근이 활성화됨
//
// 안전 가드:
//   - 본인이 본인을 초대하는 케이스 차단 (원장 == 입력 이메일)
//   - 이메일은 lowercase trim 후 비교/전송
import { useEffect, useState } from 'react';
import { Mail, Search, Send, Loader2, Check, Info } from 'lucide-react';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  findProfileByEmail,
  createAcademyInvitation,
  listAcademyInvitations,
} from '../../../services/supabase/workspaceApi';

function normalizeEmail(value) {
  return (value ?? '').trim().toLowerCase();
}

const ROLE_OPTIONS = [
  { id: 'teacher', label: '선생님', description: '배정된 수업·학생 기록 담당' },
  { id: 'manager', label: '운영 매니저', description: '데스크 운영·직원 관리' },
];

export default function StaffInviteWidget({
  initialEmail,    // 폼에 기존에 저장된 이메일 (있으면 prefill)
  initialRole = 'teacher',
  canInviteManagers = false,
  onEmailChange,   // 폼에 이메일 값을 다시 반영 (저장 시 함께 persist)
  onRoleChange,
  onInviteSent,    // 초대 row 생성 시 inviteStatus='pending' 등 폼에 반영
}) {
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const refreshWorkspaceCollaborationState = useWorkspaceStore(
    (s) => s.refreshWorkspaceCollaborationState,
  );
  const myEmail = useAuthStore((s) => s.user?.email);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [email, setEmail] = useState(initialEmail || '');
  const [role, setRole] = useState(initialRole);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null); // 'found' | 'unknown' | null
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null); // {type:'success'|'error'|'info', text}
  const [existingInvite, setExistingInvite] = useState(null);

  // 폼 prefill 이 바뀌면 따라가도록 (수정 시작 시 등)
  useEffect(() => {
    setEmail(initialEmail || '');
    setRole(initialRole);
    setSearchResult(null);
    setFeedback(null);
    setExistingInvite(null);
  }, [initialEmail, initialRole]);

  // 학원에 이미 같은 이메일의 역할 없는 직원 초대가 있는지 조회 (정보용)
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
          (inv) => normalizeEmail(inv.email) === cleaned && inv.status !== 'canceled',
        );
        setExistingInvite(match || null);
      } catch {
        // 정책 차단 등은 무시 — 폼 동작에는 영향 없음
      }
    })();
    return () => { cancelled = true; };
  }, [currentAcademyId, isAuthenticated, initialEmail]);

  const cleanedEmail = normalizeEmail(email);
  const isMyOwnEmail =
    !!cleanedEmail && !!myEmail && cleanedEmail === normalizeEmail(myEmail);

  const handleChange = (value) => {
    setEmail(value);
    setSearchResult(null);
    setFeedback(null);
    onEmailChange?.(value);
  };

  const handleRoleChange = (nextRole) => {
    setRole(nextRole);
    setFeedback(null);
    onRoleChange?.(nextRole);
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
          text: `계정을 확인했어요. ${ROLE_OPTIONS.find((item) => item.id === role)?.label || '직원'} 초대를 보낼 수 있어요.`,
        });
      } else {
        // 프로필 인덱스 생성 지연이나 RLS/네트워크 상황에서는 가입 직후에도
        // unknown 이 나올 수 있다. 초대 row 자체를 source of truth 로 둔다.
        setSearchResult('unknown');
        setFeedback({
          type: 'info',
          text:
            '가입 여부를 아직 확인하지 못했어요. 그래도 초대는 보낼 수 있고, ' +
            '해당 이메일 계정의 “받은 초대”에 자동으로 표시됩니다.',
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
      // Phase 33 — 즉시 store 에 반영해서 "대기 중인 초대" 카드가 곧바로 등장.
      useWorkspaceStore.getState().upsertAcademyInvitationLocal?.(inv);
      refreshWorkspaceCollaborationState?.({ reason: 'invite-created' });
      setFeedback({
        type: 'success',
        text: `${ROLE_OPTIONS.find((item) => item.id === role)?.label || '직원'} 초대를 보냈어요. 상대방은 수락만 하면 바로 참여해요.`,
      });
      onInviteSent?.({ email: cleanedEmail, role, status: inv.status });
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
          로그인하면 직원 초대를 보낼 수 있어요.
          더보기 화면에서 계정 로그인을 먼저 해주세요.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-gray-600">
        초대할 역할
      </label>
      <div className={`grid ${canInviteManagers ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
        {ROLE_OPTIONS
          .filter((option) => option.id !== 'manager' || canInviteManagers)
          .map((option) => {
            const selected = role === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleRoleChange(option.id)}
                className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                  selected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white active:bg-gray-50'
                }`}
              >
                <span className={`block text-xs font-bold ${selected ? 'text-blue-700' : 'text-gray-800'}`}>
                  {option.label}
                </span>
                <span className="mt-1 block text-[10px] leading-snug text-gray-500">
                  {option.description}
                </span>
              </button>
            );
          })}
      </div>

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
          직원 {inviteStatusLabel}
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
          직원 초대 보내기
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
          <span>계정을 확인했어요. “직원 초대 보내기”를 눌러 학원에 합류하도록 요청하세요.</span>
        </div>
      )}

      <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
        초대받은 직원은 이메일을 확인하고 수락하면 선택한 역할로 바로 참여해요.
      </p>
    </div>
  );
}
