// useEnsureShiftCoverage — Phase 34
//
// 강사 배정 흐름에서 "이 수업 시간을 cover 하는 근무가 있는가?" 확인 → 없거나
// 일부만 겹치면 ShiftCoverageSheet 를 띄워 자동 추가/확장을 처리한다.
//
// 사용 예 (간단):
//   const { check, sheetProps } = useEnsureShiftCoverage();
//   const ok = await check({ staff, staffRole, date, startTime, endTime });
//   if (ok) { /* 배정 진행 */ }
//   ...
//   <ShiftCoverageSheet {...sheetProps} />
//
// 'covered' 상태이거나 사용자가 '직접 설정' 을 골랐을 때 check 는 resolve(true) 반환.
// 사용자가 취소하면 resolve(false). 자동 추가/확장 성공 시 resolve(true).
//
// 호출자가 staff 의 'serverUserId' 를 채워주면 서버 write-through 도 시도. 실패는 토스트.

import { useCallback, useRef, useState } from 'react';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  createAcademyStaffShift,
  updateAcademyStaffShift as updateServerStaffShift,
} from '../../../services/supabase/domainApi';
import {
  classifyCoverage,
  findOverlappingShift,
  buildShiftDraftFromLesson,
  extendShiftToCoverLesson,
} from '../../../utils/shiftCoverage';
import { buildEffectiveStaffShifts } from '../../../utils/staffShiftCoverage';

const ROLE_LABEL = { teacher: '강사', assistant: '보조강사' };

export default function useEnsureShiftCoverage() {
  const [sheetState, setSheetState] = useState({
    open: false,
    mode: null,
    staffName: '',
    staffRoleLabel: '',
    lessonLabel: '',
    existingShiftSummary: '',
  });
  const pendingRef = useRef(null);
  const ctxRef = useRef(null);

  const closeSheet = useCallback(() => {
    setSheetState((s) => ({ ...s, open: false }));
    if (pendingRef.current) {
      pendingRef.current(false);
      pendingRef.current = null;
    }
    ctxRef.current = null;
  }, []);

  const handleChoose = useCallback(async (option) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const resolve = pendingRef.current;
    pendingRef.current = null;

    const {
      staff, staffRole, date, startTime, endTime, mode, overlappingShift,
    } = ctx;

    const showToast = useAcademyStore.getState().showToast;
    const addAcademyStaffShift = useAcademyStore.getState().addAcademyStaffShift;
    const updateAcademyStaffShift = useAcademyStore.getState().updateAcademyStaffShift;
    const setStaffShiftServerId = useAcademyStore.getState().setStaffShiftServerId;
    const isAuthenticated = useAuthStore.getState().isAuthenticated;
    const currentAcademyId = useWorkspaceStore.getState().currentAcademyId;
    const loadServerStaffShifts = useWorkspaceStore.getState().loadServerStaffShifts;

    setSheetState((s) => ({ ...s, open: false }));

    if (option === 'custom') {
      // 직접 설정 → 호출자가 처리. 일단 true 로 resolve 해서 후속 흐름 차단 X.
      // 호출자가 wantCustom 콜백을 받고 싶다면 별도 옵션으로 분기.
      resolve?.(true);
      ctxRef.current = null;
      return;
    }

    if (mode === 'none' && (option === 'exact' || option === 'buffer')) {
      const draft = buildShiftDraftFromLesson({
        staff, staffRole, date, startTime, endTime, option,
      });
      if (!draft) {
        resolve?.(false);
        ctxRef.current = null;
        return;
      }
      const created = addAcademyStaffShift(draft);
      if (staff?.serverUserId && isAuthenticated && currentAcademyId) {
        try {
          const sr = await createAcademyStaffShift({
            academyId: currentAcademyId,
            staff_user_id: staff.serverUserId,
            staff_role: staffRole,
            date,
            scheduled_start_time: draft.scheduledStartTime || null,
            scheduled_end_time: draft.scheduledEndTime || null,
            break_minutes: 0,
            status: 'scheduled',
            memo: null,
          });
          if (sr?.id) setStaffShiftServerId(created.id, sr.id);
          loadServerStaffShifts();
        } catch (err) {
          console.warn('[supabase] auto shift create failed', err);
          showToast('근무는 추가됐지만 서버 동기화는 실패했어요.', 'error');
        }
      }
      showToast('근무가 자동으로 추가됐어요.');
      resolve?.(true);
      ctxRef.current = null;
      return;
    }

    if (mode === 'partial' && option === 'extend' && overlappingShift?.isPlanned) {
      const patch = extendShiftToCoverLesson(overlappingShift, startTime, endTime);
      const draft = {
        staffId: staff?.id,
        staffRole,
        date,
        scheduledStartTime: patch?.scheduledStartTime || overlappingShift.scheduledStartTime,
        scheduledEndTime: patch?.scheduledEndTime || overlappingShift.scheduledEndTime,
        breakMinutes: overlappingShift.breakMinutes || 0,
        status: 'scheduled',
        memo: overlappingShift.memo || '',
      };
      const created = addAcademyStaffShift(draft);
      if (staff?.serverUserId && isAuthenticated && currentAcademyId) {
        try {
          const sr = await createAcademyStaffShift({
            academyId: currentAcademyId,
            staff_user_id: staff.serverUserId,
            staff_role: staffRole,
            date,
            scheduled_start_time: draft.scheduledStartTime || null,
            scheduled_end_time: draft.scheduledEndTime || null,
            break_minutes: draft.breakMinutes || 0,
            status: 'scheduled',
            memo: draft.memo || null,
          });
          if (sr?.id) setStaffShiftServerId(created.id, sr.id);
          loadServerStaffShifts();
        } catch (err) {
          console.warn('[supabase] auto shift create from planned failed', err);
          showToast('근무는 추가됐지만 서버 동기화는 실패했어요.', 'error');
        }
      }
      showToast('근무 시간을 자동으로 늘렸어요.');
      resolve?.(true);
      ctxRef.current = null;
      return;
    }

    if (mode === 'partial' && option === 'extend' && overlappingShift) {
      const patch = extendShiftToCoverLesson(overlappingShift, startTime, endTime);
      if (!patch) {
        resolve?.(true);
        ctxRef.current = null;
        return;
      }
      updateAcademyStaffShift(overlappingShift.id, patch);
      if (overlappingShift.serverId && isAuthenticated && currentAcademyId) {
        try {
          await updateServerStaffShift(overlappingShift.serverId, {
            scheduled_start_time: patch.scheduledStartTime,
            scheduled_end_time: patch.scheduledEndTime,
          });
          loadServerStaffShifts();
        } catch (err) {
          console.warn('[supabase] auto shift extend failed', err);
          showToast('근무 시간은 확장됐지만 서버 동기화는 실패했어요.', 'error');
        }
      }
      showToast('근무 시간을 자동으로 늘렸어요.');
      resolve?.(true);
      ctxRef.current = null;
      return;
    }

    // 알 수 없는 옵션 — 안전하게 false 반환.
    resolve?.(false);
    ctxRef.current = null;
  }, []);

  // check({ staff, staffRole, date, startTime, endTime }) → Promise<boolean>
  // - 'covered' 면 즉시 true
  // - 그 외엔 sheet 띄움 → 사용자 결정에 따라 true/false
  const check = useCallback(({ staff, staffRole, date, startTime, endTime }) => {
    return new Promise((resolve) => {
      if (!staff || !date || !startTime || !endTime) {
        resolve(true);
        return;
      }
      const shifts = useAcademyStore.getState().academyStaffShifts || [];
      const academyState = useAcademyStore.getState();
      const wsState = useWorkspaceStore.getState();
      const effectiveShifts = buildEffectiveStaffShifts({
        actualShifts: shifts,
        rules: wsState.staffWorkRules || [],
        exceptions: wsState.staffWorkExceptions || [],
        fromDate: date,
        toDate: date,
        academyTeachers: academyState.academyTeachers || [],
        academyAssistants: academyState.academyAssistants || [],
        staffUserId: staff.serverUserId || undefined,
      });
      const status = classifyCoverage(effectiveShifts, staff.id, date, startTime, endTime);
      if (status === 'covered') {
        resolve(true);
        return;
      }
      pendingRef.current = resolve;
      const overlapping = status === 'partial'
        ? findOverlappingShift(effectiveShifts, staff.id, date, startTime, endTime)
        : null;
      ctxRef.current = {
        staff, staffRole, date, startTime, endTime,
        mode: status,
        overlappingShift: overlapping,
      };
      setSheetState({
        open: true,
        mode: status,
        staffName: staff?.name || '',
        staffRoleLabel: ROLE_LABEL[staffRole] || '',
        lessonLabel: `${date} · ${startTime} ~ ${endTime}`,
        existingShiftSummary: overlapping
          ? `${overlapping.scheduledStartTime || '-'} ~ ${overlapping.scheduledEndTime || '-'}`
          : '',
      });
    });
  }, []);

  return {
    check,
    sheetProps: {
      ...sheetState,
      onClose: closeSheet,
      onChoose: handleChoose,
    },
  };
}
