import { FilterChip } from '@/components/catalog/FilterChip';
import type { CatalogFilters } from '@/types/catalog';

type ActiveFiltersProps = {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  total: number;
};

type ActiveEntry = {
  key: string;
  label: string;
  next: CatalogFilters;
};

const categoryLabels: Record<string, string> = {
  roupas: 'Roupas',
  acessorios: 'Acessórios',
  calcados: 'Calçados',
};

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

function ActiveFilters({ filters, onChange, total }: ActiveFiltersProps) {
  const entries = getActiveEntries(filters);

  return (
    <div className="flex flex-col gap-2">
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {entries.map((entry) => (
            <FilterChip
              key={entry.key}
              label={entry.label}
              active
              removable
              onToggle={() => onChange(entry.next)}
              onRemove={() => onChange(entry.next)}
            />
          ))}
        </div>
      )}
      <p className="font-ui text-body text-texto-auxiliar">{total} resultado(s)</p>
    </div>
  );
}

export default ActiveFilters;
