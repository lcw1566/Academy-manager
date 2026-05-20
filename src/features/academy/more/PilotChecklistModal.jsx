// PilotChecklistModal
//
// Phase 19 — 학원 파일럿 도입 전 검증용 간이 체크리스트.
// docs/academy-pilot-test-plan.md 와 1:1 대응. 외부 문서 전체를 앱에 옮기지 않고
// 핵심 8 항목만 체크박스로 표시한다.
//
// 체크 상태는 localStorage 에 저장 (academy 단위 키). 기존 도메인 데이터에는
// 일절 영향을 주지 않는다.
import { useEffect, useMemo, useState } from 'react';
import { Check, RotateCcw, Sparkles } from 'lucide-react';
import Modal from '../../../components/Modal';
import useWorkspaceStore from '../../../store/useWorkspaceStore';

const STORAGE_KEY_PREFIX = 'academy-pilot-checklist-';

const ITEMS = [
  { id: 'student',    label: '학생 추가 테스트',           hint: '이름 / 학년 / 과목 입력 후 저장' },
  { id: 'classGroup', label: '반 생성 테스트',             hint: '담당 강사 지정 + 학생 배정 + 시간 입력' },
  { id: 'lesson',     label: '수업 기록 저장 테스트',      hint: '공통 진도 + 학생별 태도·집중도·이해도' },
  { id: 'attendance', label: '출결 저장 테스트',           hint: '출석 / 결석 / 지각 / 사유결석 중 선택 후 저장' },
  { id: 'clinic',     label: '클리닉 기록 테스트',         hint: '보조강사 모드에서 학생 클리닉 작성' },
  { id: 'payment',    label: '수납 기록 테스트',           hint: '수강료 추가 → 납부 완료 토글' },
  { id: 'payroll',    label: '급여 기록 테스트',           hint: '월별 급여 자동 생성 → 지급 완료' },
  { id: 'hydrate',    label: '다른 기기 서버 데이터 불러오기 테스트', hint: 'PC↔모바일에서 동일 데이터 확인' },
];

function storageKey(academyId) {
  return `${STORAGE_KEY_PREFIX}${academyId || 'default'}`;
}

function loadChecks(academyId) {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey(academyId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveChecks(academyId, checks) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(academyId), JSON.stringify(checks));
  } catch {
    /* 저장 실패해도 UI 동작에는 영향 없음 */
  }
}

export default function PilotChecklistModal({ isOpen, onClose }) {
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const [checks, setChecks] = useState({});

  // 모달이 열릴 때마다 / 학원 전환 시 localStorage 에서 다시 불러옴
  useEffect(() => {
    if (!isOpen) return;
    setChecks(loadChecks(currentAcademyId));
  }, [isOpen, currentAcademyId]);

  const completedCount = useMemo(
    () => ITEMS.filter((it) => checks[it.id]).length,
    [checks],
  );

  const toggle = (id) => {
    setChecks((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveChecks(currentAcademyId, next);
      return next;
    });
  };

  const resetAll = () => {
    setChecks({});
    saveChecks(currentAcademyId, {});
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="파일럿 테스트 체크리스트"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetAll}
            className="px-4 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold flex items-center gap-1.5"
          >
            <RotateCcw size={14} />
            초기화
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white text-sm font-bold"
          >
            닫기
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 안내 카드 */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3.5 flex items-start gap-3">
          <Sparkles size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-blue-700 mb-0.5">
              실제 학원 도입 전 8가지 확인 항목
            </p>
            <p className="text-xs text-blue-500 leading-relaxed">
              자세한 시나리오는 <code className="bg-white/70 px-1 py-0.5 rounded">docs/academy-pilot-test-plan.md</code> 참고.
              체크는 이 기기 localStorage 에 저장됩니다.
            </p>
          </div>
        </div>

        {/* 진행률 */}
        <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-500">진행률</p>
            <p className="text-xs font-bold text-blue-600">
              {completedCount} / {ITEMS.length}
            </p>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${(completedCount / ITEMS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* 체크 항목 */}
        <div className="flex flex-col gap-2">
          {ITEMS.map((it) => {
            const done = !!checks[it.id];
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => toggle(it.id)}
                className={`w-full text-left rounded-2xl px-4 py-3.5 border transition-colors flex items-start gap-3 ${
                  done
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-white border-gray-100 active:bg-gray-50'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border-2 ${
                    done
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-white border-gray-300'
                  }`}
                >
                  {done && <Check size={14} className="text-white" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${done ? 'text-blue-700' : 'text-gray-900'}`}>
                    {it.label}
                  </p>
                  <p className={`text-xs mt-0.5 ${done ? 'text-blue-500' : 'text-gray-400'}`}>
                    {it.hint}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
