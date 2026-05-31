// QrScanSheet — Phase 41
//
// 직원/학생이 공용 QR(또는 학생 카드 QR) 를 스캔하기 위한 sheet.
//
// 실제 카메라 디코딩 라이브러리(`jsQR`, `@zxing/library`) 는 큰 의존성이라
// 현 단계에서는 추가하지 않는다. 대신:
//   1) 브라우저 BarcodeDetector API 가 있으면 활용하여 카메라 디코드를 시도. (안드로이드 크롬 지원)
//   2) 미지원이면 "QR 코드 텍스트 붙여넣기" fallback 입력을 노출.
//
// 사용처:
//   - 직원이 본인 단말에서 공용 QR 을 스캔 → 본인 shift 출퇴근
//   - owner 가 공용 단말 스캐너 모드를 켜고 학생 카드를 스캔 → 학생 등·하원 이벤트 생성
//
// 호출자는 mode prop 으로 어떤 흐름을 띄울지 결정.
//   mode='staff_self'    → 본인 shift 토글
//   mode='student_scan'  → 학원 단말이 학생 카드 스캔 → 학생 등·하원

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ClipboardPaste, Loader2, CheckCircle2, AlertTriangle, ScanLine } from 'lucide-react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useAuthStore from '../../../store/useAuthStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import {
  updateAcademyStaffShift as updateServerStaffShift,
} from '../../../services/supabase/domainApi';
import { findLocalStaffForUser } from '../../../utils/staffMatch';
import { today as todayDate } from '../../../utils/date';
import {
  parseCheckinPayload, isPayloadExpired, SHIFT_STATUS_LABELS, classifyShiftStatus,
} from './attendanceHelpers';

function nowHHmm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const hasBarcodeDetector = typeof globalThis !== 'undefined'
  && typeof globalThis.BarcodeDetector === 'function';

export default function QrScanSheet({ mode = 'staff_self', onClose }) {
  const role = useAcademyStore((s) => s.role);
  const academyTeachers = useAcademyStore((s) => s.academyTeachers) ?? [];
  const academyAssistants = useAcademyStore((s) => s.academyAssistants) ?? [];
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
  const createStudentCheckEventLocal = useWorkspaceStore((s) => s.createStudentCheckEventLocal);

  const myMembership = useMemo(
    () => memberships.find((m) => m.academy_id === currentAcademyId) || null,
    [memberships, currentAcademyId],
  );
  const myStaff = useMemo(
    () => findLocalStaffForUser(
      role === 'assistant' ? academyAssistants : academyTeachers,
      { userId: authUserId, memberId: myMembership?.id, email: authUserEmail },
    ),
    [academyTeachers, academyAssistants, role, authUserId, myMembership?.id, authUserEmail],
  );

  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, title, detail }
  const cameraRef = useRef({ stream: null, raf: 0 });
  const videoRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // 카메라 시작/정지.
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!hasBarcodeDetector) {
        setCameraError('이 브라우저는 카메라 QR 디코드를 지원하지 않아요. 텍스트 붙여넣기로 진행해주세요.');
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
      const detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!videoRef.current || !cameraRef.current.stream) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length > 0) {
            const raw = codes[0].rawValue || codes[0].rawValues?.[0];
            if (raw) {
              stopCamera();
              await processPayload(raw);
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
    cameraRef.current = { stream: null, raf: 0 };
    setCameraOn(false);
  };
  useEffect(() => () => stopCamera(), []); // 언마운트 시 정리

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
    if (!myStaff) {
      setResult({ ok: false, title: '연결된 강사 정보를 찾을 수 없어요.', detail: '원장에게 계정 연결을 요청해주세요.' });
      return;
    }
    const todayStr = todayDate();
    const todaysShifts = academyStaffShifts
      .filter((sh) => sh.staffId === myStaff.id && sh.date === todayStr && sh.status !== 'canceled')
      .sort((a, b) => (a.scheduledStartTime || '').localeCompare(b.scheduledStartTime || ''));
    const todayShift = todaysShifts[0] || null;
    if (!todayShift) {
      setResult({
        ok: false,
        title: '오늘 등록된 근무가 없어요.',
        detail: '원장에게 근무 일정을 등록해 달라고 요청하거나 스태프 탭에서 임시 근무를 추가해주세요.',
      });
      return;
    }
    const time = nowHHmm();
    const writePatch = {};
    if (!todayShift.actualStartTime) {
      writePatch.actualStartTime = time;
    } else if (!todayShift.actualEndTime) {
      writePatch.actualEndTime = time;
      writePatch.status = 'completed';
    } else {
      setResult({ ok: true, title: '이미 출퇴근이 모두 기록됐어요.', detail: `오늘 ${todayShift.actualStartTime} 출근, ${todayShift.actualEndTime} 퇴근.` });
      return;
    }
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
    const status = classifyShiftStatus({ ...todayShift, ...writePatch });
    showToast('체크인이 기록됐어요.');
    setResult({
      ok: true,
      title: writePatch.actualEndTime ? '퇴근 처리됐어요.' : '출근 처리됐어요.',
      detail: `${SHIFT_STATUS_LABELS[status] || ''} · ${time}`,
    });
  };

  const handleStudentScan = async (payload) => {
    const studentId = payload.studentId;
    const student = academyStudents.find((s) => s.id === studentId || s.serverId === studentId);
    if (!student) {
      setResult({ ok: false, title: '학생을 찾을 수 없어요.', detail: '학생이 삭제되었거나 다른 학원의 카드일 수 있어요.' });
      return;
    }
    const serverStudentId = student.serverId || studentId;
    // 직전 1시간 내 마지막 이벤트가 check_in 이면 check_out, 아니면 check_in.
    const recent = (useWorkspaceStore.getState().studentCheckEvents || [])
      .filter((e) => e.student_id === serverStudentId)
      .sort((a, b) => (b.event_time || '').localeCompare(a.event_time || ''))[0];
    const nextType = recent?.event_type === 'check_in' ? 'check_out' : 'check_in';
    try {
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
          {cameraOn ? (
            <div className="relative aspect-[4/3]">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-white/70 rounded-2xl" />
              </div>
            </div>
          ) : (
            <div className="aspect-[4/3] flex flex-col items-center justify-center text-white/80">
              <ScanLine size={28} className="text-white/60 mb-2" />
              <p className="text-sm font-bold">
                {hasBarcodeDetector ? '카메라로 QR을 스캔해주세요.' : '이 브라우저는 카메라 QR을 지원하지 않아요.'}
              </p>
              {cameraError && (
                <p className="mt-2 px-6 text-[11px] text-amber-300 text-center">{cameraError}</p>
              )}
            </div>
          )}
        </div>

        {hasBarcodeDetector && (
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
          ⓘ 카메라 디코드는 안드로이드 크롬 등 BarcodeDetector 지원 브라우저에서만 동작해요.
          미지원 환경에서는 QR 코드 텍스트를 직접 붙여넣어 진행해주세요.
        </p>
      </div>
    </Modal>
  );
}
