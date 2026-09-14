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
 * Uso:
 *   <FilterChip label="Roupas" active={selecionado} onToggle={() => alternar()} />
 *   <FilterChip label="Tamanho M" removable onRemove={() => remover('M')} />
 */
type FilterChipProps = {
  label: string;
  active?: boolean;
  onToggle?: () => void;
  removable?: boolean;
  onRemove?: () => void;
};

const baseClass =
  'inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-full border px-4 py-1 font-ui text-body-sm transition-colors focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta';

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
}: FilterChipProps) {
  const toneClass = active
    ? 'border-tinta bg-tinta text-branco-quente hover:brightness-110'
    : 'border-linha bg-branco-quente text-tinta hover:bg-papel-profundo';

  if (removable) {
    return (
      <button
        type="button"
        aria-label={`Remover ${label}`}
        onClick={onRemove}
        className={clsx(baseClass, toneClass)}
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
      className={clsx(baseClass, toneClass)}
    >
      {label}
    </button>
  );
}
