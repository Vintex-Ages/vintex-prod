import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/common/Button';
import { useAuth } from '@/context/useAuth';
import { useNotifications } from '@/context/useNotifications';
import { paths, productDetail } from '@/routes/paths';
import type { Notification } from '@/types/notification';

type NotificationBellProps = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
};

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

/** Painel in-app controlado pelo Header; dados e operações pertencem ao provider. */
export default function NotificationBell({ open, onToggle, onClose }: NotificationBellProps) {
  const {
    items,
    unreadCount,
    loading,
    error,
    retry,
    markAsRead,
    markAllAsRead,
    pendingIds,
    markingAll,
  } = useNotifications();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const id = useId();
  const bellRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const identity = !authLoading ? (user?.id ?? null) : null;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [operationError, setOperationError] = useState<{ userId: string; message: string } | null>(
    null,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
      bellRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  function isCurrent(userId: string | null) {
    return mounted.current && userId !== null && currentIdentity.current === userId;
  }

  async function readAndOpen(item: Notification) {
    const userId = identity;
    setOperationError(null);
    try {
      if (!item.isRead) await markAsRead(item.id);
      if (!isCurrent(userId)) return;
      onClose();
      navigate(item.type === 'favorite' ? productDetail(item.productId) : paths.seller);
    } catch {
      if (userId && isCurrent(userId)) {
        setOperationError({
          userId,
          message: 'Não foi possível marcar a notificação como lida. Tente novamente.',
        });
      }
    }
  }

  async function readAll() {
    const userId = identity;
    setOperationError(null);
    try {
      await markAllAsRead();
    } catch {
      if (userId && isCurrent(userId)) {
        setOperationError({
          userId,
          message: 'Não foi possível marcar todas como lidas. Tente novamente.',
        });
      }
    }
  }

  return (
    <div className="inline-flex shrink-0 tablet:relative">
      <button
        ref={bellRef}
        type="button"
        aria-label="Notificações"
        aria-describedby={`${id}-count`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="relative inline-flex size-11 min-h-touch min-w-touch shrink-0 items-center justify-center border-2 border-linha bg-branco-quente text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-6"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-vermelho-escuro px-1 font-ui text-label font-bold text-branco-quente"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      <span id={`${id}-count`} className="sr-only">
        {unreadCount === 1 ? '1 notificação não lida' : `${unreadCount} notificações não lidas`}
      </span>
      {open && (
        <section
          id={`${id}-panel`}
          aria-labelledby={`${id}-heading`}
          className="absolute inset-x-4 top-full z-10 mt-2 max-h-[calc(100dvh-10rem)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain border border-linha bg-branco-quente font-ui text-body-sm text-tinta shadow-sm tablet:left-auto tablet:right-0 tablet:w-96"
        >
          <div className="border-b border-linha p-4">
            <h2 id={`${id}-heading`} className="font-display text-xl">
              Notificações
            </h2>
            <Button
              variant="quiet"
              className="mt-2 w-full !justify-start whitespace-normal !px-0 text-body-sm"
              disabled={loading || markingAll || pendingIds.length > 0 || unreadCount === 0}
              onClick={() => void readAll()}
            >
              {markingAll ? 'Marcando como lidas…' : 'Marcar todas como lidas'}
            </Button>
          </div>
          {loading && (
            <p role="status" className="p-4">
              Carregando notificações…
            </p>
          )}
          {error && (
            <div role="alert" className="p-4">
              <p>{error}</p>
              <Button variant="quiet" onClick={retry}>
                Tentar de novo
              </Button>
            </div>
          )}
          {operationError?.userId === identity && (
            <p role="alert" className="p-4">
              {operationError.message}
            </p>
          )}
          {!loading && !error && items.length === 0 && (
            <p className="p-4">Nenhuma notificação por enquanto.</p>
          )}
          {items.length > 0 && (
            <ul className="divide-y divide-linha">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={markingAll || pendingIds.includes(item.id)}
                    onClick={() => void readAndOpen(item)}
                    className={`flex min-h-touch w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tinta disabled:cursor-wait disabled:opacity-50 ${!item.isRead ? 'bg-papel/50' : ''}`}
                  >
                    <span className="w-full break-words [overflow-wrap:anywhere]">
                      {item.type === 'sale'
                        ? `Sua peça ${item.productName} foi vendida`
                        : `Alguém favoritou sua peça ${item.productName}`}
                    </span>
                    <span className="flex w-full flex-wrap items-center justify-between gap-2 text-label">
                      <time dateTime={item.createdAt} className="text-texto-auxiliar">
                        {dateFormatter.format(new Date(item.createdAt))}
                      </time>
                      {!item.isRead && (
                        <span className="font-semibold text-vermelho-escuro">Não lida</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
