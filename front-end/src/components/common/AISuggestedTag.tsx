import clsx from 'clsx';

export type AISuggestedTagProps = {
  label?: string;
  compact?: boolean;
};

const DEFAULT_LABEL = 'Sugerido pela IA';

function SparkleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
      <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />
    </svg>
  );
}

/**
 * Tag "Sugerido pela IA" — indica que um valor (ex.: preço, categoria) foi
 * sugerido automaticamente e não foi definido/confirmado pela pessoa usuária.
 * Ver issue #186 (FE-CMP-19).
 *
 * Este componente é somente apresentação: não tem estado interno nem decide
 * quando deve aparecer — isso é responsabilidade de quem o usa.
 *
 * Não tem `onClick`, `tabIndex` nem estados de hover/foco: não é um elemento
 * interativo, então `.ai/interaction-states.md` (que trata de hover, foco e
 * pressionado em botões, links e ícone-botão) não se aplica aqui.
 *
 * Usage:
 *   import AISuggestedTag from '@/components/common/AISuggestedTag';
 *   <AISuggestedTag />
 *   <AISuggestedTag label="Preço sugerido pela IA" />
 *   <AISuggestedTag compact />
 */
function AISuggestedTag({ label, compact = false }: AISuggestedTagProps) {
  const resolvedLabel = label ?? DEFAULT_LABEL;

  return (
    <span
      role="img"
      aria-label={resolvedLabel}
      className={clsx(
        'inline-flex items-center justify-center rounded-full bg-vermelho-suave text-vermelho-escuro',
        compact ? 'h-5 w-5' : 'gap-1.5 px-2.5 py-1 text-label',
      )}
    >
      <SparkleIcon />
      {!compact && <span>{resolvedLabel}</span>}
    </span>
  );
}

export default AISuggestedTag;
