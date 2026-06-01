// HydratePromptModal
//
// Phase 17 — 로그인 후 새 기기/빈 localStorage 감지 시 표시되는 안내 모달.
// 사용자가 "서버 데이터 불러오기" 버튼을 명시적으로 누르면
// fetchAcademySnapshot → hydrateAcademyFromServerSnapshot 가 실행된다.
//
// 표시 조건 (모두 만족):
//   1) isAuthenticated
//   2) currentAcademyId 존재
//   3) 8개 server count 로더가 모두 로드 완료 (loading=false)
//   4) 서버 도메인 데이터가 1개 이상 존재 (students/classGroups/classSessions/clinic/payments 중 하나)
//   5) local 학원 도메인 데이터가 비어 있음 (academyStudents+classGroups+classSessions == 0)
//   6) 같은 세션에서 dismiss 한 적 없음 (sessionStorage 키 기준)
//
// dismiss 는 academy 단위 sessionStorage 로 추적. 학원 전환 시에는 별도 판단.
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Download, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../../store/useAuthStore';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import useAcademyStore from '../../store/useAcademyStore';
import { fetchAcademySnapshot } from '../../services/supabase/hydrateApi';

function dismissKey(academyId) {
  return `academy-hydrate-prompt-dismissed-${academyId}`;
}

function wasDismissedThisSession(academyId) {
  if (!academyId || typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(dismissKey(academyId)) === '1';
  } catch {
    return false;
  }
}

function markDismissedThisSession(academyId) {
  if (!academyId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(dismissKey(academyId), '1');
  } catch {
    /* sessionStorage 비활성 환경 — 모달이 다시 떠도 큰 문제 아님 */
  }
}

export default function HydratePromptModal() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);

  // 8개 server count loading + counts
  const isServerStudentsLoading = useWorkspaceStore((s) => s.isServerStudentsLoading);
  const isServerClassGroupsLoading = useWorkspaceStore((s) => s.isServerClassGroupsLoading);
  const isServerClassSessionsLoading = useWorkspaceStore((s) => s.isServerClassSessionsLoading);
  const isServerLessonRecordsLoading = useWorkspaceStore((s) => s.isServerLessonRecordsLoading);
  const isServerAttendanceRecordsLoading = useWorkspaceStore((s) => s.isServerAttendanceRecordsLoading);
  const isServerClinicRecordsLoading = useWorkspaceStore((s) => s.isServerClinicRecordsLoading);
  const isServerPaymentsLoading = useWorkspaceStore((s) => s.isServerPaymentsLoading);
  const isServerPayrollsLoading = useWorkspaceStore((s) => s.isServerPayrollsLoading);

  const serverStudentsCount = useWorkspaceStore((s) => s.serverStudents.length);
  const serverClassGroupsCount = useWorkspaceStore((s) => s.serverClassGroups.length);
  const serverClassSessionsCount = useWorkspaceStore((s) => s.serverClassSessions.length);
  const serverClinicRecordsCount = useWorkspaceStore((s) => s.serverClinicRecords.length);
  const serverPaymentsCount = useWorkspaceStore((s) => s.serverPayments.length);

  // server load 가 한 번이라도 시도되어 결과가 있다고 볼 수 있는 기준
  const serverStudentsLoadedAt = useWorkspaceStore((s) => s.serverStudentsLoadedAt);
  const serverClassGroupsLoadedAt = useWorkspaceStore((s) => s.serverClassGroupsLoadedAt);
  const serverClassSessionsLoadedAt = useWorkspaceStore((s) => s.serverClassSessionsLoadedAt);

  const loadServerStudents = useWorkspaceStore((s) => s.loadServerStudents);
  const loadServerClassGroups = useWorkspaceStore((s) => s.loadServerClassGroups);
  const loadServerClassSessions = useWorkspaceStore((s) => s.loadServerClassSessions);
  const loadServerLessonRecords = useWorkspaceStore((s) => s.loadServerLessonRecords);
  const loadServerAttendanceRecords = useWorkspaceStore((s) => s.loadServerAttendanceRecords);
  const loadServerClinicRecords = useWorkspaceStore((s) => s.loadServerClinicRecords);
  const loadServerPayments = useWorkspaceStore((s) => s.loadServerPayments);
  const loadServerPayrolls = useWorkspaceStore((s) => s.loadServerPayrolls);

  // local 학원 도메인 카운트
  const academyStudentsCount = useAcademyStore((s) => s.academyStudents.length);
  const classGroupsCount = useAcademyStore((s) => s.classGroups.length);
  const classSessionsCount = useAcademyStore((s) => s.classSessions.length);
  const hydrateAcademyFromServerSnapshot = useAcademyStore((s) => s.hydrateAcademyFromServerSnapshot);
  const showToast = useAcademyStore((s) => s.showToast);

  // session 단위 dismiss 추적. academyId 가 바뀌면 다시 평가.
  const [dismissed, setDismissed] = useState(() => wasDismissedThisSession(currentAcademyId));
  const [hydrating, setHydrating] = useState(false);

  useEffect(() => {
    setDismissed(wasDismissedThisSession(currentAcademyId));
  }, [currentAcademyId]);

  const anyLoading =
    isServerStudentsLoading || isServerClassGroupsLoading || isServerClassSessionsLoading ||
    isServerLessonRecordsLoading || isServerAttendanceRecordsLoading || isServerClinicRecordsLoading ||
    isServerPaymentsLoading || isServerPayrollsLoading;

  // 핵심 3개 (학생/반/회차) 가 한 번이라도 fetch 됐는지 — initializeWorkspace 의 결과를 기다리는 용도
  const hasInitialServerLoad = !!(
    serverStudentsLoadedAt && serverClassGroupsLoadedAt && serverClassSessionsLoadedAt
  );

  const hasServerData =
    serverStudentsCount > 0 ||
    serverClassGroupsCount > 0 ||
    serverClassSessionsCount > 0 ||
    serverClinicRecordsCount > 0 ||
    serverPaymentsCount > 0;

  const localAcademyEmpty =
    academyStudentsCount === 0 &&
    classGroupsCount === 0 &&
    classSessionsCount === 0;

  const shouldShow = useMemo(() => {
    if (!isAuthenticated) return false;
    if (!currentAcademyId) return false;
    if (dismissed) return false;
    if (anyLoading) return false;
    if (!hasInitialServerLoad) return false;
    if (!hasServerData) return false;
    if (!localAcademyEmpty) return false;
    return true;
  }, [
    isAuthenticated, currentAcademyId, dismissed, anyLoading,
    hasInitialServerLoad, hasServerData, localAcademyEmpty,
  ]);

  const handleDismiss = () => {
    markDismissedThisSession(currentAcademyId);
    setDismissed(true);
  };

  const handleHydrate = async () => {
    if (hydrating) return;
    if (!currentAcademyId) return;
    setHydrating(true);
    try {
      const snapshot = await fetchAcademySnapshot(currentAcademyId);
      const counts = hydrateAcademyFromServerSnapshot(snapshot, {
        strategy: 'serverWins',
        preserveLocalOnly: false,
      });
      await Promise.all([
        loadServerStudents(),
        loadServerClassGroups(),
        loadServerClassSessions(),
        loadServerLessonRecords(),
        loadServerAttendanceRecords(),
        loadServerClinicRecords(),
        loadServerPayments(),
        loadServerPayrolls(),
      ]);
      const total =
        (counts?.students || 0) + (counts?.classGroups || 0) +
        (counts?.classSessions || 0) + (counts?.lessonRecords || 0) +
        (counts?.attendanceRecords || 0) + (counts?.clinicRecords || 0) +
        (counts?.payments || 0) + (counts?.payrolls || 0);
      showToast(`서버 기준으로 데이터를 맞췄어요. (${total}개 row)`);
      handleDismiss();
    } catch (err) {
      console.error('[hydrate prompt] fetchAcademySnapshot failed', err);
      showToast(
        err?.message ?? '서버 데이터를 불러오지 못했어요.',
        'error',
      );
      // 실패 시에는 모달 닫지 않음 — 사용자가 재시도 또는 나중에 하기 선택
    } finally {
      setHydrating(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {shouldShow && (
        <>
          <motion.div
            key="hydrate-dim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={hydrating ? undefined : handleDismiss}
          />
          <motion.div
            key="hydrate-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl px-5 pt-5 pb-8 max-w-md md:max-w-[560px] mx-auto"
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Database size={18} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-gray-900">
                  서버에 저장된 학원 데이터가 있어요
                </p>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  다른 기기에서 저장한 학생, 수업, 수납 데이터를 이 기기로 불러올 수 있어요.
                  기존 로컬 전용 데이터는 유지됩니다.
                </p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-4 text-xs text-gray-500 leading-relaxed">
              <p>
                불러온 뒤에도 현재 기기의 로컬 전용 데이터는 삭제되지 않아요.
                나중에 더 보기 → 학원 워크스페이스 → 서버 데이터 패널에서 다시 불러올 수도 있어요.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDismiss}
                disabled={hydrating}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm disabled:opacity-60"
              >
                나중에 하기
              </button>
              <button
                type="button"
                onClick={handleHydrate}
                disabled={hydrating}
                className="flex-[1.4] py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {hydrating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    불러오는 중…
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    서버 데이터 불러오기
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
