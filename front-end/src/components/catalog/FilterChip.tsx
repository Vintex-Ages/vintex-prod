import clsx from 'clsx';

/**
 * FilterChip — chip selecionável usado como categoria, tamanho ou filtro ativo
 * removível. Só alterna o próprio estado visual e emite os callbacks — sem
 * lógica de negócio, ver `.ai/coding-rules.md`.
 *
 * Uso:
 *   <FilterChip label="Roupas" active={selecionado} onToggle={() => setSelecionado(!selecionado)} />
 *   <FilterChip label="Tamanho M" removable onRemove={() => removerFiltro('M')} />
 */
type FilterChipProps = {
  label: string;
  active?: boolean;
  onToggle?: () => void;
  removable?: boolean;
  onRemove?: () => void;
};

export function FilterChip({
  label,
  active = false,
  onToggle,
  removable = false,
  onRemove,
}: FilterChipProps) {
  const baseClass = clsx(
    'inline-flex items-center gap-1 rounded-full border px-3 py-1 font-ui text-body',
    active
      ? 'bg-tinta text-branco-quente border-tinta hover:brightness-110 transition'
      : 'bg-branco-quente text-tinta border-linha hover:bg-papel-profundo transition-colors',
  );

  const focusClass =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta';

  if (!removable) {
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={onToggle}
        className={clsx(baseClass, focusClass)}
      >
        {label}
      </button>
    );
  }

  return (
    <span className={baseClass}>
      <button type="button" aria-pressed={active} onClick={onToggle} className={focusClass}>
        {label}
      </button>
      <button
        type="button"
        aria-label={`Remover ${label}`}
        onClick={onRemove}
        className={focusClass}
      >
        ×
      </button>
    </span>
  );
}
