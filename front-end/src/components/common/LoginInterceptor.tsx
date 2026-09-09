import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import Button from './Button';
import IconButton from './IconButton';

export type LoginInterceptorProps = {
  open: boolean;
  title: string;
  description: string;
  onLogin: () => void;
  onRegister: () => void;
  onDismiss: () => void;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const actionClassName = 'uppercase tracking-wide';

/**
 * Overlay que interrompe uma ação que exige login (FE-US001-2, FE-US012-5).
 * Só apresentação: quem decide abrir é o hook `useProtectedAction`, este
 * componente só reage à prop `open`. Foco preso e ESC são feitos à mão (sem
 * `<dialog>` nativo — o jsdom usado nos testes não implementa `showModal`).
 *
 * Usage:
 *   import LoginInterceptor from '@/components/common/LoginInterceptor';
 *   <LoginInterceptor
 *     open={bloqueado}
 *     title="Entre para salvar seus favoritos"
 *     description="Faça login para favoritar peças, acompanhar a disponibilidade e receber alertas."
 *     onLogin={irParaLogin}
 *     onRegister={irParaCadastro}
 *     onDismiss={() => setBloqueado(false)}
 *   />
 */
function LoginInterceptor({
  open,
  title,
  description,
  onLogin,
  onRegister,
  onDismiss,
}: LoginInterceptorProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusable = cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? cardRef.current)?.focus();

    return () => previouslyFocused?.focus();
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onDismiss();
      return;
    }

    if (event.key !== 'Tab' || !cardRef.current) return;

    const focusable = Array.from(
      cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/60 p-4">
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-11/12 max-w-sm border border-linha bg-branco-quente p-6 web:max-w-md"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-display text-2xl text-tinta">
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
            onClick={onDismiss}
          />
        </div>

        <p id={descriptionId} className="mt-3 font-ui text-body text-texto-auxiliar">
          {description}
        </p>

        <div className="mt-6 flex flex-col gap-3 web:flex-row web:flex-wrap">
          <Button variant="primary" onClick={onLogin} className={`${actionClassName} web:order-2 web:flex-1`}>
            Entrar
          </Button>
          <Button
            variant="outline"
            onClick={onRegister}
            className={`${actionClassName} font-bold web:order-1 web:flex-1`}
          >
            Criar conta
          </Button>
          <Button
            variant="secondary"
            onClick={onDismiss}
            className={`${actionClassName} font-bold web:order-3 web:basis-full`}
          >
            Agora não
          </Button>
        </div>
      </div>
    </div>
  );
}

export default LoginInterceptor;
