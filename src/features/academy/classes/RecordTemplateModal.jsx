import { useState } from 'react';
import Modal from '../../../components/Modal';
import { normalizeRecordSchema } from '../../../constants/learningActivitySettings';
import RecordTemplateBuilder from './RecordTemplateBuilder';

export default function RecordTemplateModal({
  title = '기록 구성',
  description,
  initialSchema,
  saving = false,
  onClose,
  onSave,
}) {
  const [schema, setSchema] = useState(() => normalizeRecordSchema(initialSchema));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      size="wide"
      footer={(
        <button
          type="button"
          onClick={() => onSave?.(schema)}
          disabled={saving}
          className="w-full rounded-xl bg-[#3182F6] py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {saving ? '저장 중...' : '이 구성으로 저장'}
        </button>
      )}
    >
      {description && (
        <p className="mb-4 text-sm leading-relaxed text-[#6B7684]">{description}</p>
      )}
      <RecordTemplateBuilder value={schema} onChange={setSchema} />
    </Modal>
  );
}
