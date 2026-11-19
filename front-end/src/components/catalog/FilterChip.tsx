import clsx from 'clsx';

/**
 * FilterChip — chip selecionável usado como categoria, sugestão de busca ou
 * filtro ativo removível. Só alterna o próprio estado visual e emite os
 * callbacks — sem lógica de negócio, ver `.ai/coding-rules.md`.
 *
 * Decisão da revisão visual: no modo `removable` o chip inteiro é **um** botão,
 * não dois. Eram dois — o rótulo e um "×" — e o "×" era um caractere de texto
 * dentro de um botão sem preenchimento, com cerca de 10px de área de toque no
 * celular. Pior: clicar no rótulo também removia o filtro, porque `onToggle` e
 * `onRemove` recebiam a mesma ação de quem usava. Um alvo só, com o verbo no
 * `aria-label`, resolve as duas coisas.
 *
 * - **O alvo de toque respeita 44px.** As categorias agora usam o token
 *   `min-h-touch`; a faixa pode quebrar em telas estreitas para evitar scroll
 *   horizontal escondido.
 *
 * - **`compact`** é o chip menor do Figma da área admin (altura de ~32px, sem
 *   a altura mínima de toque). O padrão continua o de 44px do catálogo.
 *
 * Uso:
 *   <FilterChip label="Roupas" active={selecionado} onToggle={() => alternar()} />
 *   <FilterChip label="Pendentes" compact />
 *   <FilterChip label="Tamanho M" removable onRemove={() => remover('M')} />
 */
type FilterChipProps = {
  label: string;
  active?: boolean;
  onToggle?: () => void;
  removable?: boolean;
  onRemove?: () => void;
  compact?: boolean;
  /**
   * Cor do chip: `verde` (padrão, catálogo) ou `tinta`, a do painel do vendedor no
   * frame ajustado do Figma (T15): ativo em tinta, inativo em papel.
   */
  tone?: 'verde' | 'tinta';
};

const baseClass =
  'inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border py-2 font-ui text-label font-semibold leading-normal transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta';

/** Altura mínima de toque (44px) no padrão; `compact` dispensa. */
const touchClass = 'min-h-touch';

function RemoveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function FilterChip({
  label,
  active = false,
  onToggle,
  removable = false,
  onRemove,
  compact = false,
  tone = 'verde',
}: FilterChipProps) {
  // No painel (tom `tinta`) o frame da web tem chips de 32px; no celular segue o alvo de toque.
  const sizeClass = compact
    ? undefined
    : tone === 'tinta'
      ? clsx(touchClass, 'web:min-h-0')
      : touchClass;
  // Padding lateral do chip do painel no Figma (15,2px); o padrão do catálogo é 12px.
  const paddingClass = tone === 'tinta' ? 'px-[0.95rem]' : 'px-3';
  const toneClass =
    tone === 'tinta'
      ? active
        ? 'border-tinta bg-tinta text-branco-quente hover:brightness-110'
        : 'border-linha bg-papel text-tinta hover:bg-papel-profundo'
      : active
        ? 'border-verde-rs bg-verde-rs text-branco-quente hover:brightness-110'
        : 'border-linha bg-branco-quente text-verde-rs hover:bg-papel-profundo';

  if (removable) {
    return (
      <button
        type="button"
        aria-label={`Remover ${label}`}
        onClick={onRemove}
        className={clsx(baseClass, paddingClass, sizeClass, toneClass)}
      >
        <span>{label}</span>
        <RemoveIcon />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={clsx(baseClass, paddingClass, sizeClass, toneClass)}
    >
      {label}
    </button>
  );
}
