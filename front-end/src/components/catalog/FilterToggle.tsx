import clsx from 'clsx';

export type FilterToggleProps = {
  onClick: () => void;
  /** Number of active filters. */
  count?: number;
  open?: boolean;
};

function FilterIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx('transition-transform', open && 'rotate-180')}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function FilterToggle({ onClick, count, open = false }: FilterToggleProps) {
  const hasCount = typeof count === 'number' && count > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      className="inline-flex w-fit items-center gap-2 rounded-full border border-linha bg-branco-quente px-4 py-1.5 text-body text-tinta"
    >
      <FilterIcon />
      <span>Mais filtros</span>
      {hasCount && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-vermelho-escuro px-1.5 text-label text-branco-quente">
          {count}
        </span>
      )}
      <ChevronDownIcon open={open} />
    </button>
  );
}

export default FilterToggle;