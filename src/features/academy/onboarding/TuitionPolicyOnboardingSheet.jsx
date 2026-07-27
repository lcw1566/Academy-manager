import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { DEFAULT_ACADEMY_SETTINGS } from '../../../constants/academySettings';
import TuitionRateFields from './TuitionRateFields';

export default function TuitionPolicyOnboardingSheet({ onClose }) {
  const updateAcademyProfileSettings = useWorkspaceStore((state) => state.updateAcademyProfileSettings);
  const academySubjects = useAcademyStore((state) => state.academyProfile?.academySubjects || []);
  const setAcademyProfile = useAcademyStore((state) => state.setAcademyProfile);
  const showToast = useAcademyStore((state) => state.showToast);
  const [tuitionRates, setTuitionRates] = useState({});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateAcademyProfileSettings({
        tuitionPolicy: DEFAULT_ACADEMY_SETTINGS.tuitionPolicy,
        tuitionRates,
      });
      setAcademyProfile({
        tuitionPolicy: DEFAULT_ACADEMY_SETTINGS.tuitionPolicy,
        tuitionRates,
      });
      showToast('수강료 가격표를 저장했어요.');
      onClose?.();
    } catch (error) {
      showToast(error?.message || '수강료 가격표를 저장하지 못했어요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="수강료 설정"
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0064FF] py-3.5 font-bold text-white disabled:bg-blue-300"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          저장
        </button>
      }
    >
      <p className="mb-2 text-sm text-gray-500">학교급별 기본 금액을 입력하고 필요한 예외만 추가해주세요.</p>
      <TuitionRateFields
        rates={tuitionRates}
        onChange={setTuitionRates}
        subjects={academySubjects}
      />
    </Modal>
  );
}
