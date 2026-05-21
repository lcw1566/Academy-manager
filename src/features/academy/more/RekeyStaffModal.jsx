// RekeyStaffModal
//
// Phase 24 — manual reconciliation tool.
//
// Use case: a server-linked staff (id = teacher_<userId>) was created from
// an invitation, but the academy already had historical class/session
// assignments under a different local id (typically because the owner
// previously created a local-only entry with the same person's name).
//
// This modal lets the owner pick one of the OTHER local staff entries and
// reassign their classGroups.teacherId / classSessions.teacherId (or
// clinicTasks.assignedToId for assistants) to the server-linked id.
//
// Safety:
//   - Owner must confirm.
//   - Source list excludes the target and excludes server-linked entries
//     (you can only rekey FROM a plain local entry, never from one server
//     mirror to another).
//   - The source entry is NOT deleted automatically — owner can clean it up
//     later from the existing staff list UI once they've verified the move.
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';

export default function RekeyStaffModal({
  isOpen,
  onClose,
  kind,           // 'teacher' | 'assistant'
  targetStaff,    // the server-linked local entry that will receive the assignments
}) {
  const academyTeachers = useAcademyStore((s) => s.academyTeachers);
  const academyAssistants = useAcademyStore((s) => s.academyAssistants);
  const classGroups = useAcademyStore((s) => s.classGroups);
  const classSessions = useAcademyStore((s) => s.classSessions);
  const clinicTasks = useAcademyStore((s) => s.clinicTasks);
  const rekeyTeacherSessions = useAcademyStore((s) => s.rekeyTeacherSessions);
  const rekeyAssistantClinicTasks = useAcademyStore((s) => s.rekeyAssistantClinicTasks);
  const showToast = useAcademyStore((s) => s.showToast);

  const [pickedId, setPickedId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const list = kind === 'teacher' ? academyTeachers : academyAssistants;

  // Candidate sources: same kind, NOT the target, NOT already server-linked.
  // Also compute their assignment counts so the owner sees which entries
  // actually have historical data worth moving.
  const candidates = useMemo(() => {
    if (!targetStaff) return [];
    return list
      .filter((entry) => entry.id !== targetStaff.id)
      .filter((entry) => entry.source !== 'server')
      .map((entry) => {
        if (kind === 'teacher') {
          const groupCount = classGroups.filter((g) => g.teacherId === entry.id).length;
          const sessionCount = classSessions.filter((s) => s.teacherId === entry.id).length;
          return { entry, groupCount, sessionCount };
        }
        const taskCount = clinicTasks.filter((t) => t.assignedToId === entry.id).length;
        return { entry, taskCount };
      })
      // Sort by "has something to move" first so noise is at the bottom.
      .sort((a, b) => {
        const aCount = kind === 'teacher'
          ? (a.groupCount + a.sessionCount)
          : a.taskCount;
        const bCount = kind === 'teacher'
          ? (b.groupCount + b.sessionCount)
          : b.taskCount;
        return bCount - aCount;
      });
  }, [list, targetStaff, kind, classGroups, classSessions, clinicTasks]);

  const handleClose = () => {
    if (submitting) return;
    setPickedId(null);
    onClose?.();
  };

  const handleConfirm = async () => {
    if (!pickedId || !targetStaff || submitting) return;
    setSubmitting(true);
    try {
      if (kind === 'teacher') {
        const { classGroupsTouched, classSessionsTouched } =
          rekeyTeacherSessions(pickedId, targetStaff.id);
        showToast(
          `반 ${classGroupsTouched}개, 수업 회차 ${classSessionsTouched}개를 ${targetStaff.name} 으로 이관했어요.`,
        );
      } else {
        const { clinicTasksTouched } =
          rekeyAssistantClinicTasks(pickedId, targetStaff.id);
        showToast(
          `클리닉 업무 ${clinicTasksTouched}개를 ${targetStaff.name} 으로 이관했어요.`,
        );
      }
      setPickedId(null);
      onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !targetStaff) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="기존 수업 배정 연결"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!pickedId || submitting}
            className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : null}
            연결하기
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 leading-relaxed">
            <p className="font-bold mb-1">소스에서 대상으로 배정을 옮깁니다</p>
            <p>
              {kind === 'teacher'
                ? '선택한 로컬 강사의 반/수업 회차 배정이 모두 서버 연결 강사로 옮겨져요. 원래 강사 카드는 삭제되지 않으니, 확인 후 직접 정리해주세요.'
                : '선택한 로컬 보조강사의 클리닉 업무 배정이 모두 서버 연결 보조강사로 옮겨져요. 원래 보조강사 카드는 삭제되지 않으니 확인 후 직접 정리해주세요.'}
            </p>
          </div>
        </div>

        {/* Target preview */}
        <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 px-4 py-3">
          <p className="text-[11px] font-bold text-blue-600 mb-1">대상 (서버 연결)</p>
          <p className="text-sm font-bold text-gray-900">{targetStaff.name}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
            id: {targetStaff.id}
          </p>
        </div>

        {candidates.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl px-4 py-6 text-center">
            <p className="text-sm text-gray-500 mb-1">옮길 수 있는 로컬 항목이 없어요.</p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              서버 연결된 항목은 소스로 선택할 수 없어요.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">
              소스 (로컬 항목 중 하나 선택)
            </p>
            <div className="flex flex-col gap-2">
              {candidates.map((c) => {
                const picked = pickedId === c.entry.id;
                return (
                  <button
                    key={c.entry.id}
                    type="button"
                    onClick={() => setPickedId(c.entry.id)}
                    className={`w-full text-left rounded-2xl px-4 py-3 border-2 transition-colors ${
                      picked
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white active:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900 flex-1 min-w-0 truncate">
                        {c.entry.name || '(이름 없음)'}
                      </p>
                      {picked && (
                        <ArrowRight size={13} className="text-blue-600 flex-shrink-0" />
                      )}
                    </div>
                    {c.entry.email && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                        {c.entry.email}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {kind === 'teacher'
                        ? `배정된 반 ${c.groupCount}개 · 수업 회차 ${c.sessionCount}개`
                        : `클리닉 업무 ${c.taskCount}개`}
                    </p>
                    <p className="text-[10px] text-gray-300 mt-0.5 truncate">id: {c.entry.id}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
