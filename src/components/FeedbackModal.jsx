import { useEffect, useMemo, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import { Bug, ImagePlus, Lightbulb, Loader2, Send, Trash2 } from 'lucide-react';
import Modal from './Modal';
import useAcademyStore from '../store/useAcademyStore';
import useWorkspaceStore from '../store/useWorkspaceStore';
import {
  MAX_FEEDBACK_IMAGE_SIZE,
  submitProductFeedback,
  validateFeedbackImage,
} from '../services/supabase/feedbackApi';

const CATEGORY_OPTIONS = [
  {
    id: 'bug',
    label: '버그 신고',
    description: '오류나 이상한 동작',
    Icon: Bug,
  },
  {
    id: 'improvement',
    label: '개선 제안',
    description: '더 편해질 아이디어',
    Icon: Lightbulb,
  },
];

export default function FeedbackModal({ isOpen, onClose }) {
  const role = useAcademyStore((s) => s.role);
  const activeTab = useAcademyStore((s) => s.activeTab);
  const currentMode = useAcademyStore((s) => s.currentMode);
  const showToast = useAcademyStore((s) => s.showToast);
  const currentAcademyId = useWorkspaceStore((s) => s.currentAcademyId);
  const fileInputRef = useRef(null);
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const previewUrl = useMemo(
    () => (image ? URL.createObjectURL(image) : null),
    [image],
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (isOpen) return;
    setCategory('bug');
    setMessage('');
    setImage(null);
    setError('');
    setSubmitting(false);
  }, [isOpen]);

  const close = () => {
    if (!submitting) onClose?.();
  };

  const selectImage = (event) => {
    const nextImage = event.target.files?.[0] || null;
    event.target.value = '';
    if (!nextImage) return;
    try {
      validateFeedbackImage(nextImage);
      setImage(nextImage);
      setError('');
    } catch (validationError) {
      setError(validationError.message);
    }
  };

  const submit = async () => {
    const normalizedMessage = message.trim();
    if (normalizedMessage.length < 10) {
      setError('상황을 알 수 있도록 10자 이상 적어주세요.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await submitProductFeedback({
        category,
        message: normalizedMessage,
        image,
        academyId: currentMode === 'academy' ? currentAcademyId : null,
        role,
        appMode: currentMode,
        activeTab,
      });
      showToast('소중한 의견을 보냈어요. 확인 후 개선할게요.');
      onClose?.();
    } catch (submitError) {
      Sentry.captureException(submitError, {
        tags: {
          feature: 'product-feedback',
          feedback_category: category,
        },
        extra: { hasAttachment: Boolean(image) },
      });
      setError(submitError?.message || '의견을 보내지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="버그 신고 · 개선 제안"
      fitContent
      footer={(
        <button
          type="button"
          onClick={submit}
          disabled={submitting || message.trim().length < 10}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-seenit-brand text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          {submitting ? '보내는 중' : '의견 보내기'}
        </button>
      )}
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-seenit-ink">어떤 의견인가요?</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {CATEGORY_OPTIONS.map(({ id, label, description, Icon }) => {
              const selected = category === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCategory(id)}
                  className={`min-h-[72px] rounded-lg border px-3 py-3 text-left transition-colors ${
                    selected
                      ? 'border-seenit-brand bg-seenit-brand-soft text-seenit-brand'
                      : 'border-seenit-border bg-seenit-surface text-seenit-secondary'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <Icon size={17} />
                    {label}
                  </span>
                  <span className="mt-1 block text-xs text-seenit-subtle">{description}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor="product-feedback-message" className="text-sm font-bold text-seenit-ink">
              자세히 알려주세요
            </label>
            <span className="text-xs tabular-nums text-seenit-subtle">{message.length}/4000</span>
          </div>
          <textarea
            id="product-feedback-message"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value.slice(0, 4000));
              if (error) setError('');
            }}
            rows={5}
            autoFocus
            placeholder={category === 'bug'
              ? '무엇을 하던 중이었고, 어떤 문제가 생겼는지 적어주세요.'
              : '어떤 점이 더 편해지면 좋을지 적어주세요.'}
            className="w-full resize-none rounded-lg border border-seenit-border bg-seenit-surface px-4 py-3 text-sm leading-6 text-seenit-ink outline-none transition-colors placeholder:text-seenit-subtle focus:border-seenit-brand"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-seenit-ink">화면 이미지</p>
            <span className="text-xs text-seenit-subtle">선택 · 최대 {MAX_FEEDBACK_IMAGE_SIZE / 1024 / 1024}MB</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={selectImage}
          />
          {previewUrl ? (
            <div className="flex items-center gap-3 rounded-lg border border-seenit-border bg-seenit-elevated p-3">
              <img
                src={previewUrl}
                alt="첨부 이미지 미리보기"
                className="h-16 w-20 rounded-md object-cover"
              />
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-seenit-secondary">{image.name}</p>
              <button
                type="button"
                onClick={() => setImage(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-seenit-muted hover:bg-seenit-control"
                aria-label="첨부 이미지 삭제"
                title="첨부 이미지 삭제"
              >
                <Trash2 size={17} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-seenit-border text-sm font-semibold text-seenit-secondary hover:bg-seenit-elevated"
            >
              <ImagePlus size={18} />
              이미지 첨부
            </button>
          )}
        </div>

        <p className="rounded-lg bg-seenit-elevated px-3 py-2.5 text-xs leading-5 text-seenit-muted">
          현재 메뉴와 기기 화면 크기가 함께 전송돼요. 학생 이름, 연락처 등 개인정보는 내용이나 이미지에 넣지 말아주세요.
        </p>

        {error && (
          <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>
        )}
      </div>
    </Modal>
  );
}
