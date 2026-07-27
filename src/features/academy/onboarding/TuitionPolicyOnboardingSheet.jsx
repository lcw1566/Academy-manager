import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import useAcademyStore from '../../../store/useAcademyStore';
import useWorkspaceStore from '../../../store/useWorkspaceStore';
import { TUITION_POLICY_OPTIONS } from '../../../constants/academySettings';
import TuitionRateFields from './TuitionRateFields';

export default function TuitionPolicyOnboardingSheet({ onClose }) {
  const updateAcademyProfileSettings = useWorkspaceStore((state) => state.updateAcademyProfileSettings);
  const setAcademyProfile = useAcademyStore((state) => state.setAcademyProfile);
  const showToast = useAcademyStore((state) => state.showToast);
  const [tuitionPolicy, setTuitionPolicy] = useState('');
  const [tuitionRates, setTuitionRates] = useState({});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!tuitionPolicy || saving) return;
    setSaving(true);
    try {
      await updateAcademyProfileSettings({ tuitionPolicy, tuitionRates });
      setAcademyProfile({ tuitionPolicy, tuitionRates });
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
      title="수강료 기준"
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={!tuitionPolicy || saving}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#0064FF] py-3.5 font-bold text-white disabled:bg-blue-300"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          저장
        </button>
      }
    >
      <p className="mb-3 text-sm text-gray-500">반을 만들 때 자동으로 불러올 기준과 금액을 설정해주세요.</p>
      <div className="grid grid-cols-3 gap-2">
        {TUITION_POLICY_OPTIONS.map((option) => {
          const selected = tuitionPolicy === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTuitionPolicy(option.id)}
              className={`relative rounded-2xl border px-2 py-4 text-center ${
                selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
              }`}
            >
              {selected && (
                <Check size={13} className="absolute right-2 top-2 text-blue-600" />
              )}
              <p className={`text-sm font-bold ${selected ? 'text-blue-700' : 'text-gray-900'}`}>
                {option.label}
              </p>
              <p className="mt-1 text-[10px] text-gray-500">{option.description}</p>
            </button>
          );
        })}
      </div>
      <TuitionRateFields
        policy={tuitionPolicy}
        rates={tuitionRates}
        onChange={setTuitionRates}
      />
    </Modal>
  );
}
