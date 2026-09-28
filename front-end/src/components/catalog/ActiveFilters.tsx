import { FilterChip } from '@/components/catalog/FilterChip';
import type { CatalogFilters } from '@/types/catalog';
import { CATEGORIES } from '@/components/catalog/categories';
import { formatPieceCount } from '@/utils/format';

type ActiveFiltersProps = {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  total: number;
  /** Enquanto carrega, a contagem anterior não vale — some em vez de mentir. */
  loading?: boolean;
};

type ActiveEntry = {
  key: string;
  label: string;
  next: CatalogFilters;
};

/**
 * Rótulo do chip derivado da mesma lista que o `FilterPanel` envia, para os
 * dois não divergirem. O valor gravado é o do dado ("Sapatos"), o rótulo é o
 * da tela ("Calçados").
 */
const categoryLabels: Record<string, string> = Object.fromEntries(
  CATEGORIES.filter((c) => c.value).map((c) => [c.value as string, c.label]),
);

function getActiveEntries(filters: CatalogFilters): ActiveEntry[] {
  const entries: ActiveEntry[] = [];

  if (filters.category) {
    entries.push({
      key: 'category',
      label: categoryLabels[filters.category] ?? filters.category,
      next: { ...filters, category: undefined },
    });
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const min = filters.minPrice ?? 0;
    const max = filters.maxPrice;
    entries.push({
      key: 'price',
      label: max !== undefined ? `R$ ${min} - R$ ${max}` : `A partir de R$ ${min}`,
      next: { ...filters, minPrice: undefined, maxPrice: undefined },
    });
  }

  (['size', 'brand', 'condition', 'color'] as const).forEach((field) => {
    (filters[field] ?? []).forEach((value) => {
      entries.push({
        key: `${field}-${value}`,
        label: value,
        next: { ...filters, [field]: filters[field]?.filter((item) => item !== value) },
      });
    });
  });

  if (filters.city) {
    entries.push({ key: 'city', label: filters.city, next: { ...filters, city: undefined } });
  }

  if (filters.state) {
    entries.push({ key: 'state', label: filters.state, next: { ...filters, state: undefined } });
  }

  return entries;
}

function ActiveFilters({ filters, onChange, total, loading = false }: ActiveFiltersProps) {
  const entries = getActiveEntries(filters);

  return (
    <div className="flex flex-col gap-3">
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {entries.map((entry) => (
            <FilterChip
              key={entry.key}
              label={entry.label}
              active
              removable
              onRemove={() => onChange(entry.next)}
            />
          ))}

          {/*
            Sair de uma combinação de filtros um chip por vez é trabalhoso a
            partir de dois. Com um só, o próprio chip já é o "limpar".
          */}
          {entries.length > 1 && (
            <button
              type="button"
              onClick={() => onChange({})}
              className="font-ui text-body-sm text-texto-auxiliar underline underline-offset-4 transition-colors hover:text-vermelho-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      <p aria-live="polite" className="font-ui text-body-sm text-texto-auxiliar">
        {loading
          ? 'Buscando peças…'
          : `${formatPieceCount(total)} ${total === 1 ? 'encontrada' : 'encontradas'}`}
      </p>
    </div>
  );
}

export default ActiveFilters;
