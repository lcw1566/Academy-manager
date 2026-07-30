// QrScanSheet — Phase 41
//
// 직원/학생이 공용 QR(또는 학생 카드 QR) 를 스캔하기 위한 sheet.
//
//   1) 브라우저 BarcodeDetector API 가 있으면 활용하여 카메라 디코드를 시도.
//   2) 미지원이면 jsQR 로 비디오 프레임을 디코드한다.
//   3) 카메라 자체가 열리지 않는 환경에서는 "QR 코드 텍스트 붙여넣기" fallback 입력을 노출.
//
// 사용처:
//   - 직원이 본인 단말에서 공용 QR 을 스캔 → 본인 shift 출퇴근
//   - owner 가 공용 단말 스캐너 모드를 켜고 학생 카드를 스캔 → 학생 등·하원 이벤트 생성
//
// 호출자는 mode prop 으로 어떤 흐름을 띄울지 결정.
//   mode='staff_self'    → 본인 shift 토글
//   mode='student_scan'  → 학원 단말이 학생 카드 스캔 → 학생 등·하원

import { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, ClipboardPaste, Loader2, CheckCircle2, AlertTriangle, ScanLine } from 'lucide-react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  updateAcademyStaffShift as updateServerStaffShift,
} from '../../../services/supabase/domainApi';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import {
  parseCheckinPayload,
  isPayloadExpired,
  SHIFT_STATUS_LABELS,
  classifyShiftStatus,
  getAcademyYmd,
  getStudentDayCheckState,
} from './attendanceHelpers';
import { canUseNativeQrScanner, scanNativeQrCode } from './nativeQrScanner';
import { getKoreaHHMM } from '../../../utils/date';

function nowHHmm() {
  return getKoreaHHMM();
}

const hasBarcodeDetector = typeof globalThis !== 'undefined'
  && typeof globalThis.BarcodeDetector === 'function';

function canUseCameraApi() {
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia;
}

export default function QrScanSheet({ mode = 'staff_self', staffRoleFallback, autoStartCamera = false, onClose }) {
  const role = useAcademyStore((s) => s.role);
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
  const academyManagers = useAcademyStore((s) => s.academyManagers) ?? [];
  const academyStaffShifts = useAcademyStore((s) => s.academyStaffShifts) ?? [];
  const academyStudents = useAcademyStore((s) => s.academyStudents) ?? [];
  const updateAcademyStaffShift = useAcademyStore((s) => s.updateAcademyStaffShift);
  const showToast = useAcademyStore((s) => s.showToast);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUserId = useAuthStore((s) => s.user?.id);
  const authUserEmail = useAuthStore((s) => s.user?.email);
  const memberships = useWorkspaceStore((s) => s.memberships) ?? [];
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const loadServerStaffShifts = useWorkspaceStore((s) => s.loadServerStaffShifts);
  const loadStudentCheckEvents = useWorkspaceStore((s) => s.loadStudentCheckEvents);
  const createStudentCheckEventLocal = useWorkspaceStore((s) => s.createStudentCheckEventLocal);
  const toggleStudentCheckEventLocal = useWorkspaceStore((s) => s.toggleStudentCheckEventLocal);

  const myMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );
  const myStaff = useMemo(
    () => findLocalStaffForUser(
      role === 'assistant' ? academyAssistants : role === 'manager' ? academyManagers : academyTeachers,
      { userId: authUserId, memberId: myMembership?.id, email: authUserEmail },
    ),
    [academyTeachers, academyAssistants, academyManagers, role, authUserId, myMembership?.id, authUserEmail],
  );

  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, title, detail }
  const cameraRef = useRef({ stream: null, raf: 0 });
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const closeTimerRef = useRef(0);
  const canUseCamera = canUseCameraApi();
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // 카메라 시작/정지.
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (canUseNativeQrScanner()) {
        const raw = await scanNativeQrCode();
        if (raw) await processPayload(raw);
        else setCameraError('QR을 읽지 못했어요. 다시 시도해주세요.');
        return;
      }

      if (!canUseCameraApi()) {
        setCameraError('이 브라우저에서는 카메라를 열 수 없어요. 텍스트 붙여넣기로 진행해주세요.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      cameraRef.current.stream = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      let detector = null;
      if (hasBarcodeDetector) {
        try {
          detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
        } catch (err) {
          console.warn('[qr] BarcodeDetector init failed, falling back to jsQR', err);
        }
      }

      const tick = async () => {
        if (!videoRef.current || !cameraRef.current.stream) return;
        const video = videoRef.current;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
          cameraRef.current.raf = requestAnimationFrame(tick);
          return;
        }

        try {
          if (detector) {
            try {
              const codes = await detector.detect(video);
              if (codes && codes.length > 0) {
                const raw = codes[0].rawValue || codes[0].rawValues?.[0];
                if (raw) {
                  stopCamera();
                  await processPayload(raw);
                  return;
                }
              }
            } catch (err) {
              detector = null;
              console.warn('[qr] BarcodeDetector failed, falling back to jsQR', err);
            }
          }

          const canvas = canvasRef.current || document.createElement('canvas');
          canvasRef.current = canvas;
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (canvas.width !== width) canvas.width = width;
          if (canvas.height !== height) canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const image = ctx.getImageData(0, 0, width, height);
            const code = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });
            if (code?.data) {
              stopCamera();
              await processPayload(code.data);
              return;
            }
          }
        } catch (err) {
          console.warn('[qr] detect failed', err);
        }
        cameraRef.current.raf = requestAnimationFrame(tick);
      };
      cameraRef.current.raf = requestAnimationFrame(tick);
    } catch (err) {
      setCameraError(err?.message || '카메라를 열 수 없어요.');
    }
  };
  const stopCamera = () => {
    const { stream, raf } = cameraRef.current;
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    cameraRef.current = { stream: null, raf: 0 };
    setCameraOn(false);
  };
  const closeAfterSuccess = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = 0;
      onClose?.();
    }, 900);
  };
  useEffect(() => {
    if (autoStartCamera) startCamera();
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      stopCamera();
    };
  }, []); // 언마운트 시 정리

  const processPayload = async (raw) => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const payload = parseCheckinPayload(raw);
      if (!payload) {
        setResult({ ok: false, title: '읽을 수 없는 QR이에요.', detail: '학원에서 발급한 QR인지 확인해주세요.' });
        return;
      }
      if (!isAuthenticated || !currentAcademyId) {
        setResult({ ok: false, title: '로그인 후에 이용해주세요.' });
        return;
      }
      if (payload.academyId !== currentAcademyId) {
        setResult({ ok: false, title: '다른 학원의 QR이에요.', detail: '현재 선택된 학원과 일치하지 않아요.' });
        return;
      }
      if (isPayloadExpired(payload)) {
        setResult({ ok: false, title: 'QR이 만료됐어요.', detail: '공용 화면을 새로고침해주세요.' });
        return;
      }

      if (mode === 'staff_self') {
        await handleStaffCheckin();
        return;
      }
      if (mode === 'student_scan') {
        if (payload.type !== 'academy_student_card') {
          setResult({
            ok: false,
            title: '학생 카드 QR이 아니에요.',
            detail: '공용 QR이 아니라 학생 카드 QR을 스캔해주세요.',
          });
          return;
        }
        await handleStudentScan(payload);
        return;
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStaffCheckin = async () => {
    const staffUserId = myStaff?.serverUserId || authUserId;
    const staffRoleForLog = myStaff?._role || staffRoleFallback || (
      role === 'assistant' ? 'assistant' : role === 'manager' ? 'manager' : 'teacher'
    );
    if (!staffUserId) {
      setResult({ ok: false, title: '로그인 정보를 확인할 수 없어요.', detail: '다시 로그인한 뒤 시도해주세요.' });
      return;
    }
    const todayStr = getAcademyYmd() || '';
    const todaysShifts = myStaff?.id
      ? academyStaffShifts
          .filter((sh) => sh.staffId === myStaff.id && sh.date === todayStr && sh.status !== 'canceled')
          .sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''))
      : [];
    const todayShift = todaysShifts[0] || null;
    const time = nowHHmm();

    // Phase 44.7 / Phase C — 오늘 본인 attendance log SoT.
    // legacy shift 가 있으면 함께 갱신, 없으면 log 만 사용.
    const staffAttendanceLogs = useWorkspaceStore.getState().staffAttendanceLogs || [];
    const existingLog = staffUserId
      ? staffAttendanceLogs.find(
          (l) => l.staff_user_id === staffUserId && l.work_date === todayStr,
        )
      : null;

    // 상태 결정 — log 우선, legacy shift 보조.
    const hasStart = !!(existingLog?.actual_start_time || todayShift?.actualStartTime);
    const hasEnd = !!(existingLog?.actual_end_time || todayShift?.actualEndTime);

    if (hasEnd) {
      setResult({
        ok: true,
        title: '이미 출퇴근이 모두 기록됐어요.',
        detail: `${existingLog?.actual_start_time || todayShift?.actualStartTime || ''} 출근, ${existingLog?.actual_end_time || todayShift?.actualEndTime || ''} 퇴근.`,
      });
      return;
    }

    const fieldKey = hasStart ? 'actual_end_time' : 'actual_start_time';
    const writePatch = {};
    if (fieldKey === 'actual_start_time') writePatch.actualStartTime = time;
    else { writePatch.actualEndTime = time; writePatch.status = 'completed'; }

    // 1) staff_attendance_logs가 서버 기준 원본이다. 이 저장이 실패하면 로컬
    // 근무표만 바꾸거나 성공 메시지를 표시하지 않는다.
    try {
      const confirmedPatch = {
        [fieldKey]: time,
        status: 'approved',
        approved_at: new Date().toISOString(),
      };
      const savedLog = existingLog?.id
        ? await useWorkspaceStore.getState().updateStaffAttendanceLogLocal(
            existingLog.id,
            confirmedPatch,
          )
        : await useWorkspaceStore.getState().createStaffAttendanceLogLocal({
            staff_user_id: staffUserId,
            staff_role: staffRoleForLog,
            work_date: todayStr,
            scheduled_start_time: todayShift?.scheduledStartTime || null,
            scheduled_end_time: todayShift?.scheduledEndTime || null,
            break_minutes: todayShift?.breakMinutes ?? 0,
            [fieldKey]: time,
            source: 'qr',
            status: 'approved',
            approved_at: confirmedPatch.approved_at,
          });
      if (!savedLog?.id) {
        throw new Error('서버에서 근태 저장 결과를 확인하지 못했어요.');
      }
    } catch (err) {
      console.error('[qr] attendance log upsert failed', err);
      const detail = err?.message || '네트워크를 확인하고 다시 시도해주세요.';
      showToast('근태 기록을 저장하지 못했어요.', 'error');
      setResult({
        ok: false,
        title: '근태 저장에 실패했어요.',
        detail,
      });
      return;
    }

    // 2) legacy academy_staff_shifts (best-effort 호환).
    if (todayShift) {
      updateAcademyStaffShift(todayShift.id, writePatch);
      if (todayShift.serverId) {
        try {
          const serverPatch = {};
          if (writePatch.actualStartTime) serverPatch.actual_start_time = writePatch.actualStartTime;
          if (writePatch.actualEndTime)   serverPatch.actual_end_time = writePatch.actualEndTime;
          if (writePatch.status)          serverPatch.status = writePatch.status;
          await updateServerStaffShift(todayShift.serverId, serverPatch);
          loadServerStaffShifts();
        } catch (err) {
          console.warn('[qr] staff shift write failed', err);
        }
      }
    }

    const status = classifyShiftStatus({ ...(todayShift || {}), ...writePatch });
    const successMessage = writePatch.actualEndTime ? '퇴근됐어요' : '출근되었어요';
    showToast(successMessage);
    setResult({
      ok: true,
      title: writePatch.actualEndTime ? '퇴근 처리됐어요.' : '출근 처리됐어요.',
      detail: `${SHIFT_STATUS_LABELS[status] || ''} · ${time} · 바로 저장됨`,
    });
    closeAfterSuccess();
  };

  const handleStudentScan = async (payload) => {
    const studentId = payload.studentId;
    const student = academyStudents.find((s) => s.id === studentId || s.serverId === studentId);
    if (!student) {
      setResult({ ok: false, title: '학생을 찾을 수 없어요.', detail: '학생이 삭제되었거나 다른 학원의 카드일 수 있어요.' });
      return;
    }
    if (!student.serverId) {
      setResult({
        ok: false,
        title: '학생 정보 동기화가 필요해요.',
        detail: '학생 목록을 새로고침한 뒤 다시 스캔해주세요.',
      });
      return;
    }
    const serverStudentId = student.serverId;
    try {
      // SQL 035 적용 환경: 두 단말이 동시에 스캔해도 서버에서 직렬화한다.
      const atomicResult = await toggleStudentCheckEventLocal({
        studentId: serverStudentId,
        source: 'qr',
      });
      if (atomicResult?.event) {
        const eventType = atomicResult.event.event_type;
        const eventLabel = eventType === 'check_out' ? '하원' : '등원';
        showToast(
          atomicResult.duplicate
            ? `이미 ${eventLabel} 처리됐어요.`
            : `${eventLabel}으로 기록했어요.`,
        );
        setResult({
          ok: true,
          title: atomicResult.duplicate
            ? `이미 ${eventLabel} 처리됐어요.`
            : `${eventLabel} 처리됐어요.`,
          detail: atomicResult.duplicate
            ? `${student.name || '학생'} · 중복 스캔은 기록하지 않았어요.`
            : `${student.name || '학생'} · ${nowHHmm()}`,
        });
        closeAfterSuccess();
        return;
      }

      // SQL 035 적용 전 배포에서도 전날 기록과 연속 스캔을 안전하게 처리한다.
      // 캐시의 전날 기록으로 다음 날 첫 스캔이 하원이 되는 일을 막기 위해
      // 한국 시간 기준 오늘 기록을 서버에서 다시 확인한다.
      const todayYmd = getAcademyYmd();
      await loadStudentCheckEvents({ sinceDateYMD: todayYmd, limit: 1000 });
      const state = getStudentDayCheckState(
        serverStudentId,
        todayYmd,
        useWorkspaceStore.getState().studentCheckEvents || [],
      );
      const latestTime = state.latest?.event_time
        ? new Date(state.latest.event_time).getTime()
        : 0;
      if (latestTime && Date.now() - latestTime < 8000) {
        const latestLabel = state.latest.event_type === 'check_out' ? '하원' : '등원';
        setResult({
          ok: true,
          title: `이미 ${latestLabel} 처리됐어요.`,
          detail: `${student.name || '학생'} · 중복 스캔은 기록하지 않았어요.`,
        });
        closeAfterSuccess();
        return;
      }

      const nextType = state.isInside ? 'check_out' : 'check_in';
      await createStudentCheckEventLocal({
        studentId: serverStudentId,
        eventType: nextType,
        source: 'qr',
      });
      showToast(nextType === 'check_in' ? '등원으로 기록했어요.' : '하원으로 기록했어요.');
      setResult({
        ok: true,
        title: nextType === 'check_in' ? '등원 처리됐어요.' : '하원 처리됐어요.',
        detail: `${student.name || '학생'} · ${nowHHmm()}`,
      });
    } catch (err) {
      setResult({ ok: false, title: '체크인 저장 실패', detail: err?.message ?? '잠시 후 다시 시도해주세요.' });
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={mode === 'student_scan' ? '학생 카드 스캔' : 'QR 체크인'}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-gray-100 text-gray-700 font-bold py-3.5 rounded-xl"
        >
          닫기
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 카메라 영역 */}
        <div className="bg-[#0B1220] rounded-2xl overflow-hidden">
          <div className="relative aspect-[4/3]">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover ${cameraOn ? 'block' : 'hidden'}`}
            />
            {cameraOn ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-white/70 rounded-2xl" />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80">
                <ScanLine size={28} className="text-white/60 mb-2" />
                <p className="text-sm font-bold">
                  {canUseCamera ? '카메라로 QR을 스캔해주세요.' : '카메라를 사용할 수 없는 브라우저예요.'}
                </p>
                {cameraError && (
                  <p className="mt-2 px-6 text-[11px] text-amber-300 text-center">{cameraError}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {canUseCamera && (
          <button
            type="button"
            onClick={cameraOn ? stopCamera : startCamera}
            className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 ${
              cameraOn ? 'bg-gray-100 text-gray-700' : 'bg-[#3182F6] text-white'
            }`}
          >
            <Camera size={14} />
            {cameraOn ? '카메라 끄기' : '카메라로 스캔'}
          </button>
        )}

        {/* 텍스트 붙여넣기 fallback */}
        <div className="bg-[#F8F9FA] rounded-2xl p-3 flex flex-col gap-2">
          <p className="text-xs font-bold text-[#4E5968] flex items-center gap-1">
            <ClipboardPaste size={12} className="text-[#8B95A1]" />
            QR 코드 텍스트 붙여넣기
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={3}
            placeholder='{"v":1,"type":"academy_checkin",...}'
            className="input resize-none text-[11px] font-mono"
          />
          <button
            type="button"
            onClick={() => processPayload(paste)}
            disabled={busy || !paste.trim()}
            className="w-full py-2.5 rounded-xl bg-[#191F28] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            확인
          </button>
        </div>

        {/* 결과 */}
        {result && (
          <div className={`rounded-2xl px-4 py-3 flex items-start gap-2 ${
            result.ok ? 'bg-emerald-50' : 'bg-amber-50'
          }`}>
            {result.ok ? (
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${result.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                {result.title}
              </p>
              {result.detail && (
                <p className={`text-[11px] mt-0.5 leading-relaxed ${
                  result.ok ? 'text-emerald-700/80' : 'text-amber-700/80'
                }`}>{result.detail}</p>
              )}
            </div>
          </div>
        )}

        <p className="text-[11px] text-[#8B95A1] leading-relaxed">
          ⓘ 카메라 권한을 허용하면 QR을 바로 스캔할 수 있어요.
          카메라를 열 수 없는 환경에서는 QR 코드 텍스트를 직접 붙여넣어 진행해주세요.
        </p>
      </div>
    </Modal>
  );
}
