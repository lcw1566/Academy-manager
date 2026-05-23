// BulkShiftSuggestionSheet — Phase 35
//
// 반(class group) 을 만들거나 수정한 직후, 그 반에서 발생한 회차들에 대해
// 담당 강사/보조강사의 근무가 부족하면 한 번에 추가/확장을 제안한다.
//
// 입력 props:
//   - open: boolean
//   - lessonsByStaff: Map<staffKey, { staff, staffRole, sessions: [{date, startTime, endTime}, ...] }>
//     ※ staffKey 는 staff.id 그대로 사용해도 충분.
//   - onClose: () => void
//
// 옵션:
//   1. 수업 시간만 근무로 추가
//   2. 앞뒤 30분 포함
//   3. 직접 나중에 설정 (취소)
//   4. 취소
//
// 처리 흐름 (option 1/2):
//   1) lessonsByStaff → 각 lesson 의 draft 생성 (exact/buffer)
//   2) mergeShiftDraftsForStaffDate 로 같은 staff/date 안에서 병합
//   3) 기존 shift 와 비교 (planShiftForDraft) — skip / extend / create
//   4) 처리: create → addAcademyStaffShift + 서버 createAcademyStaffShift
//             extend → updateAcademyStaffShift + 서버 update
//             skip   → 표시만 (이미 cover됨)
//   5) 결과 토스트.
//
// 중복 생성 방지 정책:
//   - 같은 학원 안에서 똑같은 (staffId, date, scheduled 시간) 의 shift 는 추가하지 않는다.
//   - extend 흐름은 기존 row 1개만 늘리고, 추가 row 생성은 하지 않는다.

import { useMemo, useState } from 'react';
import { Plus, ChevronRight, Loader2, Clock, AlertTriangle } from 'lucide-react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyStaffShift,
  updateAcademyStaffShift as updateServerStaffShift,
} from '../../../services/supabase/domainApi';
import {
  buildShiftDraftFromLesson,
  mergeShiftDraftsForStaffDate,
  planShiftForDraft,
  extendShiftToCoverLesson,
} from '../../../utils/shiftCoverage';

const ROLE_LABEL = { teacher: '강사', assistant: '보조강사' };

export default function BulkShiftSuggestionSheet({
  open,
  lessonsByStaff,
  onClose,
}) {
  const [busy, setBusy] = useState(null);

  // 요약 — 몇 명, 몇 회차에 영향이 있는지.
  const summary = useMemo(() => {
    if (!lessonsByStaff) return { staffCount: 0, sessionCount: 0 };
    let staffCount = 0;
    let sessionCount = 0;
    for (const v of lessonsByStaff.values()) {
      if (v.sessions.length > 0) {
        staffCount += 1;
        sessionCount += v.sessions.length;
      }
    }
    return { staffCount, sessionCount };
  }, [lessonsByStaff]);

  if (!open) return null;

  const handlePick = async (option) => {
    if (busy) return;
    setBusy(option);
    try {
      if (option === 'exact' || option === 'buffer') {
        await applyBulkShiftCreation({ lessonsByStaff, option });
      }
    } finally {
      setBusy(null);
      onClose?.();
    }
  };

  if (summary.staffCount === 0) {
    // 영향 없는 케이스는 모달을 띄울 의미가 없음 → 즉시 닫기 처리는 부모 책임.
    return null;
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="근무표도 함께 만들까요?">
      <div className="flex flex-col gap-4">
        <div className="bg-blue-50 rounded-2xl px-4 py-3 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0">
            <Clock size={16} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900">
              강사·보조강사 {summary.staffCount}명 · 수업 {summary.sessionCount}회
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              방금 만든 수업 시간에 맞춰 근무표를 자동으로 만들 수 있어요.
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          이미 등록된 근무시간은 중복으로 만들지 않아요.
          일부만 겹치면 기존 근무를 늘려서 수업 전체를 포함해요.
        </p>

        <div className="flex flex-col gap-2">
          <OptionRow
            primary
            title="수업 시간만 근무로 추가"
            subtitle="추천 · 수업 시작/끝 시간에 맞춰 근무 일정을 만들어요."
            onClick={() => handlePick('exact')}
            busy={busy === 'exact'}
          />
          <OptionRow
            title="앞뒤 30분 여유 포함해서 추가"
            subtitle="수업 전후 준비/정리 시간까지 근무로 잡아요."
            onClick={() => handlePick('buffer')}
            busy={busy === 'buffer'}
          />
          <OptionRow
            title="직접 나중에 설정"
            subtitle="근무 탭에서 시간을 직접 입력할게요."
            onClick={onClose}
          />
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed">
          보조강사는 필요한 경우에만 배정하세요. 시급 급여는 근무 시간을 기준으로 계산돼요.
        </p>
      </div>
    </Modal>
  );
}

function OptionRow({ title, subtitle, onClick, primary, busy }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:opacity-80 disabled:opacity-60 ${
        primary ? 'bg-[#0064FF] text-white' : 'bg-white border border-gray-200 text-gray-800'
      }`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${primary ? 'bg-white/20' : 'bg-gray-100'}`}>
        {busy ? (
          <Loader2 size={16} className={`animate-spin ${primary ? 'text-white' : 'text-gray-600'}`} />
        ) : (
          <Plus size={16} className={primary ? 'text-white' : 'text-gray-600'} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${primary ? 'text-white' : 'text-gray-900'}`}>{title}</p>
        {subtitle && (
          <p className={`text-xs mt-0.5 leading-relaxed ${primary ? 'text-white/80' : 'text-gray-500'}`}>
            {subtitle}
          </p>
        )}
      </div>
      <ChevronRight size={14} className={primary ? 'text-white/80' : 'text-gray-300'} />
    </button>
  );
}

// ─── 처리 로직 ─────────────────────────────────────────────────────
async function applyBulkShiftCreation({ lessonsByStaff, option }) {
  if (!lessonsByStaff || lessonsByStaff.size === 0) return;

  const academyState = useAcademyStore.getState();
  const wsState = useWorkspaceStore.getState();
  const authState = useAuthStore.getState();

  const isAuthenticated = authState.isAuthenticated;
  const currentAcademyId = wsState.currentAcademyId;
  const loadServerStaffShifts = wsState.loadServerStaffShifts;

  let createdCount = 0;
  let extendedCount = 0;
  let skippedCount = 0;

  for (const { staff, staffRole, sessions } of lessonsByStaff.values()) {
    if (!staff?.id || !sessions || sessions.length === 0) continue;

    // 1) 각 lesson → draft 변환
    const drafts = sessions
      .map((sess) => buildShiftDraftFromLesson({
        staff, staffRole,
        date: sess.date,
        startTime: sess.startTime,
        endTime: sess.endTime,
        option,
      }))
      .filter(Boolean);

    // 2) 같은 staff/date 안에서 인접 구간 병합.
    //    반 생성 흐름은 동일 staff 가 같은 날 여러 회차를 가질 수 있으므로
    //    2시간 이내 틈은 하나의 근무로 묶는다. (예: 16-18, 19-20 → 16-20)
    const merged = mergeShiftDraftsForStaffDate(drafts, { mergeGapMinutes: 120 });

    // 3) 기존 shift 와 비교 → skip / extend / create
    for (const draft of merged) {
      const existingShifts = useAcademyStore.getState().academyStaffShifts || [];
      const plan = planShiftForDraft(existingShifts, draft);
      if (plan.action === 'skip') {
        skippedCount += 1;
        continue;
      }
      if (plan.action === 'extend' && plan.existing) {
        const patch = extendShiftToCoverLesson(
          plan.existing,
          draft.scheduledStartTime,
          draft.scheduledEndTime,
        );
        if (!patch) {
          skippedCount += 1;
          continue;
        }
        academyState.updateAcademyStaffShift(plan.existing.id, patch);
        if (plan.existing.serverId && isAuthenticated && currentAcademyId) {
          try {
            await updateServerStaffShift(plan.existing.serverId, {
              scheduled_start_time: patch.scheduledStartTime,
              scheduled_end_time: patch.scheduledEndTime,
            });
          } catch (err) {
            console.warn('[supabase] bulk shift extend failed', err);
          }
        }
        extendedCount += 1;
        continue;
      }
      // create
      const created = academyState.addAcademyStaffShift(draft);
      if (staff.serverUserId && isAuthenticated && currentAcademyId) {
        try {
          const sr = await createAcademyStaffShift({
            academyId: currentAcademyId,
            staff_user_id: staff.serverUserId,
            staff_role: staffRole,
            date: draft.date,
            scheduled_start_time: draft.scheduledStartTime || null,
            scheduled_end_time: draft.scheduledEndTime || null,
            break_minutes: 0,
            status: 'scheduled',
            memo: null,
          });
          if (sr?.id) academyState.setStaffShiftServerId(created.id, sr.id);
        } catch (err) {
          console.warn('[supabase] bulk shift create failed', err);
        }
      }
      createdCount += 1;
    }
  }

  if (loadServerStaffShifts && isAuthenticated && currentAcademyId) {
    try { await loadServerStaffShifts(); } catch { /* ignore */ }
  }

  const parts = [];
  if (createdCount > 0) parts.push(`${createdCount}건 추가`);
  if (extendedCount > 0) parts.push(`${extendedCount}건 확장`);
  if (skippedCount > 0) parts.push(`${skippedCount}건은 이미 있음`);
  academyState.showToast(parts.length > 0 ? `근무표 ${parts.join(' · ')}` : '추가된 근무 일정이 없어요.');
}
