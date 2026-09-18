import type { FocusEvent, MouseEvent } from 'react';
import clsx from 'clsx';

export type ToastKind = 'info' | 'success' | 'error';

export type ToastAction = {
  label: string;
  onSelect: () => void;
};

export type ToastProps = {
  message: string;
  kind?: ToastKind;
  action?: ToastAction;
  onClose: () => void;
  onPause?: () => void;
  onResume?: () => void;
};

/**
 * Aviso transitório utilizado para feedbacks rápidos da aplicação.
 *
 * O componente cuida apenas da apresentação e das interações genéricas.
 * O tempo de exibição e o empilhamento dos avisos são controlados pelo
 * ToastProvider.
 *
 * Usage:
 *   <Toast
 *     message="Peça adicionada ao carrinho"
 *     kind="success"
 *     onClose={() => {}}
 *   />
 */
function Toast({
  message,
  kind = 'info',
  action,
  onClose,
  onPause,
  onResume,
}: ToastProps) {
  const role = kind === 'error' ? 'alert' : 'status';

  const borderClass = clsx({
    'border-linha': kind === 'info',
    'border-verde-rs': kind === 'success',
    'border-vermelho-escuro': kind === 'error',
  });

  const handleMouseEnter = () => {
    onPause?.();
  };

  const handleMouseLeave = () => {
    onResume?.();
  };

  const handleFocus = () => {
    onPause?.();
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      onResume?.();
    }
  };

  const handleAction = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    action?.onSelect();
    onClose();
  };

  return (
    <div
      role={role}
      className={clsx(
        'flex w-full items-center gap-3 border bg-tinta px-4 py-3 font-ui text-body text-papel',
        borderClass,
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <span aria-hidden="true" className="shrink-0">
        {kind === 'success' ? '✓' : kind === 'error' ? '!' : 'i'}
      </span>

      <p className="min-w-0 flex-1">{message}</p>

      {action ? (
        <button
          type="button"
          onClick={handleAction}
          className="min-h-touch shrink-0 px-2 font-ui text-label font-semibold text-papel underline transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-branco-quente"
        >
          {action.label}
        </button>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar aviso"
        className="flex min-h-touch min-w-touch shrink-0 items-center justify-center text-papel transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-branco-quente"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export default Toast;