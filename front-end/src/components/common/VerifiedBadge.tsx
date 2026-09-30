import clsx from 'clsx';

/** Estados do selo; os valores são os mesmos de `StoreVerification` (`@/types/store`). */
export type VerifiedBadgeState = 'pendente' | 'confiavel';

export type VerifiedBadgeProps = {
  /** Estado do selo. Tem precedência sobre `verified`. */
  state?: VerifiedBadgeState;
  /**
   * Atalho da S1: `true` equivale a `state="confiavel"`; `false` não
   * renderiza nada (quem não quer mostrar "Pendente" continua usando assim).
   */
  verified?: boolean;
  /** Texto visível do estado Confiável; sem ele, o selo confiável é só o ícone. */
  label?: string;
};

/** Domain term for this indicator — see `.ai/glossary.md` ("Selo Confiável"). */
const DEFAULT_LABEL = 'Confiável';
const PENDING_LABEL = 'Pendente';

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

/**
 * Selo "Confiável" — indica a verificação simulada do vendedor
 * (ver `.ai/glossary.md`, "Selo Confiável"). É só apresentação: não executa
 * nenhuma verificação real/externa.
 *
 * - `state="confiavel"` (ou `verified`): verde, com ✓; texto só com `label`.
 * - `state="pendente"`: "Pendente" em `dourado` (atenção), sempre com texto —
 *   um ícone de relógio sozinho não diz o que está pendente (FE-US007-1).
 * - `verified={false}` sem `state`: não renderiza nada (comportamento da S1).
 *
 * Usage:
 *   import VerifiedBadge from '@/components/common/VerifiedBadge';
 *   <VerifiedBadge verified={vendedor.verificado} />
 *   <VerifiedBadge state={loja.verification} label="Confiável" />
 */
function VerifiedBadge({ state, verified, label }: VerifiedBadgeProps) {
  const resolved: VerifiedBadgeState | null = state ?? (verified ? 'confiavel' : null);

  if (resolved === null) {
    return null;
  }

  if (resolved === 'pendente') {
    return (
      <span
        role="img"
        aria-label={PENDING_LABEL}
        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-dourado px-2.5 py-1 text-label text-tinta"
      >
        <ClockIcon />
        <span>{PENDING_LABEL}</span>
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={label ?? DEFAULT_LABEL}
      className={clsx(
        'inline-flex items-center justify-center rounded-full bg-verde-rs text-branco-quente',
        label ? 'gap-1.5 px-2.5 py-1 text-label' : 'h-5 w-5',
      )}
    >
      <CheckIcon />
      {label && <span>{label}</span>}
    </span>
  );
}

export default VerifiedBadge;
