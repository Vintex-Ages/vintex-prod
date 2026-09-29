import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import clsx from 'clsx';
import IconButton from './IconButton';

export type DialogSize = 'sm' | 'md' | 'full';

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  /** Texto curto sob o título, ligado ao `aria-describedby` do diálogo. */
  description?: ReactNode;
  /** Ações fixas no rodapé (fora da área rolável do conteúdo). */
  footer?: ReactNode;
  size?: DialogSize;
  /** Clique no fundo escurecido fecha o diálogo. ESC sempre fecha. */
  closeOnBackdrop?: boolean;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const panelSizeClass: Record<DialogSize, string> = {
  sm: 'w-11/12 max-w-sm web:max-w-md',
  md: 'w-11/12 max-w-lg web:max-w-2xl',
  // Tela cheia no celular; no web vira um painel centralizado largo.
  full: 'h-full w-full web:h-auto web:max-h-full web:w-11/12 web:max-w-3xl',
};

/**
 * Overlay modal genérico (FE-CMP-28, extraído do `LoginInterceptor`): fundo
 * escurecido, `role="dialog"` + `aria-modal`, foco preso, ESC fecha e o foco
 * volta para quem abriu. Só apresentação: quem decide abrir é a página/hook,
 * este componente só reage à prop `open`. Sem `<dialog>` nativo — o jsdom dos
 * testes não implementa `showModal`.
 *
 * Usage:
 *   import Dialog from '@/components/common/Dialog';
 *   <Dialog
 *     open={aberto}
 *     onClose={() => setAberto(false)}
 *     title="Remover peça?"
 *     description="A peça sai do carrinho."
 *     footer={<Button onClick={remover}>Remover</Button>}
 *   >
 *     <p>Conteúdo opcional</p>
 *   </Dialog>
 */
function Dialog({
  open,
  onClose,
  title,
  children,
  description,
  footer,
  size = 'sm',
  closeOnBackdrop = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? panelRef.current)?.focus();

    return () => previouslyFocused?.focus();
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab' || !panelRef.current) return;

    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    // Só o clique no próprio fundo fecha; cliques dentro do painel borbulham até aqui.
    if (closeOnBackdrop && event.target === event.currentTarget) onClose();
  }

  return (
    <div
      data-testid="dialog-backdrop"
      onClick={handleBackdropClick}
      className={clsx(
        'fixed inset-0 z-50 flex items-center justify-center bg-tinta/60',
        size === 'full' ? 'p-0 web:p-8' : 'p-4',
      )}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={clsx(
          'flex max-h-full flex-col border border-linha bg-branco-quente p-6',
          panelSizeClass[size],
        )}
      >
        <div className="flex items-start justify-between gap-4">
          {/*
            `text-h3` num `h2`: com 48px num cartao de 384px o titulo ocupava
            quatro linhas e empurrava os botoes para fora da dobra no celular.
          */}
          <h2 id={titleId} className="font-display text-h3 text-tinta">
            {title}
          </h2>

          <IconButton
            icon={
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
            }
            ariaLabel="Fechar"
            onClick={onClose}
          />
        </div>

        {description && (
          <div id={descriptionId} className="mt-3 font-ui text-body text-texto-auxiliar">
            {description}
          </div>
        )}

        {children && <div className="mt-4 flex min-h-0 flex-1 flex-col">{children}</div>}

        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </div>
  );
}

export default Dialog;
