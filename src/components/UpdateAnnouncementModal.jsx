import { useEffect, useMemo, useState } from 'react';
import { BellRing, Check, Sparkles } from 'lucide-react';
import Modal from './Modal';
import { PRODUCT_UPDATES } from '../constants/productUpdates';
import useAcademyStore from '../store/useAcademyStore';
import useAuthStore from '../store/useAuthStore';

const INITIAL_DELAY_MS = 1200;
const MODAL_RETRY_MS = 700;

function appliesToUser(update, role, mode) {
  const roleMatches = !update.roles?.length || update.roles.includes(role);
  const modeMatches = !update.modes?.length || update.modes.includes(mode);
  return roleMatches && modeMatches;
}

function readKey(userId, updateId) {
  return `seenit-product-update:${userId}:${updateId}`;
}

function wasRead(userId, updateId) {
  try {
    return window.localStorage.getItem(readKey(userId, updateId)) === '1';
  } catch {
    return false;
  }
}

function rememberRead(userId, updateId) {
  try {
    window.localStorage.setItem(readKey(userId, updateId), '1');
  } catch {
    // 브라우저 저장소가 차단돼도 현재 화면에서는 다시 열지 않는다.
  }
}

export default function UpdateAnnouncementModal() {
  const userId = useAuthStore((s) => s.user?.id);
  const role = useAcademyStore((s) => s.role);
  const currentMode = useAcademyStore((s) => s.currentMode);
  const [isOpen, setIsOpen] = useState(false);

  const update = useMemo(
    () => PRODUCT_UPDATES.find((item) => appliesToUser(item, role, currentMode)) || null,
    [role, currentMode],
  );

  useEffect(() => {
    if (!userId || !update || wasRead(userId, update.id)) return undefined;

    let timerId;
    const openWhenReady = () => {
      // 로그인 직후 온보딩 등 더 중요한 모달이 떠 있으면 닫힐 때까지 기다린다.
      if (document.body.style.overflow === 'hidden') {
        timerId = window.setTimeout(openWhenReady, MODAL_RETRY_MS);
        return;
      }
      setIsOpen(true);
    };

    timerId = window.setTimeout(openWhenReady, INITIAL_DELAY_MS);
    return () => window.clearTimeout(timerId);
  }, [userId, update]);

  if (!update) return null;

  const acknowledge = () => {
    if (userId) rememberRead(userId, update.id);
    setIsOpen(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={acknowledge}
      title="씨닛 업데이트"
      fitContent
      footer={(
        <button
          type="button"
          onClick={acknowledge}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-seenit-brand text-sm font-bold text-white"
        >
          <Check size={18} />
          확인했어요
        </button>
      )}
    >
      <div>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-seenit-brand-soft text-seenit-brand">
            <BellRing size={21} />
          </div>
          <div className="min-w-0 pt-0.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-seenit-brand">
              <Sparkles size={14} />
              새로운 소식 · {update.dateLabel}
            </div>
            <h3 className="mt-1.5 text-lg font-extrabold leading-7 text-seenit-ink">
              {update.title}
            </h3>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-seenit-secondary">{update.summary}</p>

        <ul className="mt-4 space-y-3 border-t border-seenit-border-soft pt-4">
          {update.items.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-seenit-secondary">
              <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-seenit-brand-soft text-seenit-brand">
                <Check size={11} strokeWidth={3} />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
