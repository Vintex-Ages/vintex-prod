import type { ReactNode } from 'react';

type AccountButtonProps = {
  label: string;
  open: boolean;
  onClick: () => void;
  icon?: ReactNode;
};

/**
 * Botão de conta para o header — apresentação e comportamento genérico
 * (abre/fecha um menu). Sem regra de negócio: quem chama decide o que
 * onClick faz.
 *
 * Usage:
 * import { AccountButton } from '@/components/layout/AccountButton';
 * <AccountButton label="Entrar" open={aberto} onClick={() => setAberto((v) => !v)} />
 */
export function AccountButton({ label, open, onClick, icon }: AccountButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="menu"
      className={`inline-flex items-center gap-3 px-3 py-2 font-ui text-label font-bold uppercase tracking-wide text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta ${
        open ? 'border border-linha bg-branco-quente' : 'border border-transparent bg-transparent'
      }`}
    >
      {icon ?? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5.5 20c0-4 2.8-6.5 6.5-6.5s6.5 2.5 6.5 6.5" />
        </svg>
      )}

      <span>{label}</span>

      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
      </svg>
    </button>
  );
}
