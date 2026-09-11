import { useEffect, useMemo, useState } from 'react';
import * as Sentry from '@sentry/react';
import { BellRing, Check, Sparkles } from 'lucide-react';
import Modal from './Modal';
import {
  PRODUCT_UPDATES,
  isProductUpdateEligible,
} from '../constants/productUpdates';
import useAcademyStore from '../store/useAcademyStore';
import useAuthStore from '../store/useAuthStore';
import {
  listReadProductUpdateIds,
  markProductUpdateRead,
} from '../services/supabase/productUpdatesApi';

const INITIAL_DELAY_MS = 1200;
const MODAL_RETRY_MS = 700;

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
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const role = useAcademyStore((s) => s.role);
  const currentMode = useAcademyStore((s) => s.currentMode);
  const [isOpen, setIsOpen] = useState(false);

  const update = useMemo(
    () => PRODUCT_UPDATES.find((item) => isProductUpdateEligible(item, {
      role,
      mode: currentMode,
      userCreatedAt: user?.created_at,
    })) || null,
    [role, currentMode, user?.created_at],
  );

  useEffect(() => {
    if (!userId || !update) return undefined;
    if (wasRead(userId, update.id)) {
      // 서버 읽음 기능 도입 전에 이 기기에서 확인한 기록도 다른 기기로 동기화한다.
      void markProductUpdateRead(update.id).catch((error) => {
        console.warn('[product-update] local acknowledgement backfill failed', error);
      });
      return undefined;
    }

    let cancelled = false;
    let timerId;
    const openWhenReady = () => {
      if (cancelled) return;
      // 로그인 직후 온보딩 등 더 중요한 모달이 떠 있으면 닫힐 때까지 기다린다.
      if (document.body.style.overflow === 'hidden') {
        timerId = window.setTimeout(openWhenReady, MODAL_RETRY_MS);
        return;
      }
      setIsOpen(true);
    };

    const prepareAnnouncement = async () => {
      const startedAt = Date.now();
      try {
        const readIds = await listReadProductUpdateIds([update.id]);
        if (cancelled) return;
        if (readIds.includes(update.id)) {
          rememberRead(userId, update.id);
          return;
        }
      } catch (error) {
        // 서버 읽음 동기화가 실패해도 로컬 읽음 상태로 공지 기능은 계속 동작한다.
        console.warn('[product-update] read state sync failed', error);
        Sentry.captureException(error, {
          tags: { area: 'product-update-read-sync', operation: 'select' },
        });
      }

      const remainingDelay = Math.max(0, INITIAL_DELAY_MS - (Date.now() - startedAt));
      timerId = window.setTimeout(openWhenReady, remainingDelay);
    };

    void prepareAnnouncement();
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [userId, update]);

  if (!update) return null;

  const acknowledge = () => {
    if (userId) {
      rememberRead(userId, update.id);
      void markProductUpdateRead(update.id).catch((error) => {
        console.warn('[product-update] acknowledgement sync failed', error);
        Sentry.captureException(error, {
          tags: { area: 'product-update-read-sync', operation: 'upsert' },
        });
      });
    }
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
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-seenit-brand text-sm font-bold text-seenit-on-brand"
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
