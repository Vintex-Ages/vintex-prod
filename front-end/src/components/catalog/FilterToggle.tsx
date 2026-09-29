import clsx from 'clsx';
import chevronDownIcon from '@/assets/catalog/chevron-down.svg';
import filterIcon from '@/assets/catalog/filter.svg';

export type FilterToggleProps = {
  onClick: () => void;
  /** Number of active filters. */
  count?: number;
  open?: boolean;
};

function ChevronDownIcon({ open }: { open: boolean }) {
  return <img src={chevronDownIcon} alt="" className={clsx('h-[14.4px] w-[14.4px] transition-transform', open && 'rotate-180')} />;
}

/**
 * Botão "Mais filtros" do catálogo — abre o painel e expõe a contagem de
 * filtros ativos no nome acessível. A apresentação segue o componente Figma.
 *
 * Usage:
 *   import FilterToggle from '@/components/catalog/FilterToggle';
 *   <FilterToggle open={aberto} count={filtrosAtivos} onClick={() => setAberto((v) => !v)} />
 */
function FilterToggle({ onClick, count, open = false }: FilterToggleProps) {
  const hasCount = typeof count === 'number' && count > 0;
  const accessibleName = hasCount
    ? `Mais filtros, ${count} ${count === 1 ? 'filtro ativo' : 'filtros ativos'}`
    : 'Mais filtros';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={accessibleName}
      className="inline-flex min-h-touch w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-linha bg-branco-quente px-3 py-2 text-verde-rs transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
    >
      <img src={filterIcon} alt="" className="h-[14.4px] w-[14.4px]" />
      <ChevronDownIcon open={open} />
    </button>
  );
}

export default FilterToggle;
