// ProfileEditModal
//
// Lets the logged-in user edit their own public.profiles row:
//   - display_name
//   - phone
//
// Email is read-only (it comes from auth.users; changing it requires a
// dedicated Supabase auth flow). Account type is shown for reference but
// not editable here — users can change it via a separate UI if we add one.
//
// Used by AcademyMorePage (and any other Page that wants profile edit).
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '../../components/Modal';
import { formatPhoneNumber } from '../../utils/format';
import useWorkspaceStore from '../../store/useWorkspaceStore';
import useAuthStore from '../../store/useAuthStore';

const ACCOUNT_TYPE_LABEL = {
  tutor: '과외 선생님',
  owner: '학원 원장',
  staff: '직원',
};

export default function ProfileEditModal({ isOpen, onClose, onSaved }) {
  const profile = useWorkspaceStore((s) => s.profile);
  const updateProfileBasic = useWorkspaceStore((s) => s.updateProfileBasic);
  const authEmail = useAuthStore((s) => s.user?.email);

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset form when modal opens / profile changes
  useEffect(() => {
    if (!isOpen) return;
    setDisplayName(profile?.display_name || '');
    setPhone(profile?.phone || '');
    setError(null);
  }, [isOpen, profile]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateProfileBasic({
        displayName: displayName.trim() || null,
        phone: phone.trim() || null,
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message ?? '프로필 저장에 실패했어요.');
    } finally {
      setSaving(false);
    }
  };

  const accountTypeLabel = ACCOUNT_TYPE_LABEL[profile?.account_type] || '과외 선생님';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="내 프로필 수정"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : null}
            저장
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">이름</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="홍길동"
            className="input"
          />
          <p className="text-[11px] text-gray-400 mt-1.5">
            학원에 초대된 경우 원장이 보는 이름이기도 해요.
          </p>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 mb-1.5 block">연락처</label>
          <input
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
            placeholder="010-0000-0000"
            className="input"
          />
        </div>

        <div className="rounded-2xl bg-gray-50 px-3 py-3">
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-gray-500">이메일</span>
            <span className="text-xs font-medium text-gray-700 truncate ml-3">
              {authEmail || profile?.email || '-'}
            </span>
          </div>
          <div className="flex items-center justify-between py-1 border-t border-gray-100 mt-2 pt-2">
            <span className="text-xs text-gray-500">계정 유형</span>
            <span className="text-xs font-bold text-gray-700">{accountTypeLabel}</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
            이메일과 계정 유형은 여기서 변경할 수 없어요.
          </p>
        </div>

        {error && (
          <div className="text-xs rounded-xl px-3 py-2.5 bg-red-50 text-red-600">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
