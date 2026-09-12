import { useState } from 'react';
import { FilterChip } from '@/components/catalog/FilterChip';
import FilterToggle from '@/components/catalog/FilterToggle';
import FilterCheckboxGroup from '@/components/catalog/FilterCheckboxGroup';
import type { CatalogFilters } from '@/types/catalog';

type FilterPanelProps = {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  sizeOptions?: string[];
  brandOptions?: string[];
  conditionOptions?: string[];
  colorOptions?: string[];
};

const categories = [
  { label: 'Tudo', value: undefined },
  { label: 'Roupas', value: 'roupas' },
  { label: 'Acessórios', value: 'acessorios' },
  { label: 'Calçados', value: 'calcados' },
];

/**
 * Painel de filtros do catálogo.
 * Mantém somente o estado visual de abertura e envia alterações ao componente pai.
 */
function FilterPanel({
  filters,
  onChange,
  sizeOptions = [],
  brandOptions = [],
  conditionOptions = [],
  colorOptions = [],
}: FilterPanelProps) {
  const [open, setOpen] = useState(false);

  const updateFilter = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const toggleOption = (
    key: 'size' | 'brand' | 'condition' | 'color',
    value: string,
    checked: boolean,
  ) => {
    const current = filters[key] ?? [];
    const next = checked ? [...current, value] : current.filter((item) => item !== value);

    updateFilter(key, next.length ? next : undefined);
  };

  // Conta os sete grupos de filtros ativos.
  const activeCount = [
    filters.category,
    filters.minPrice !== undefined || filters.maxPrice !== undefined,
    filters.size?.length,
    filters.brand?.length,
    filters.condition?.length,
    filters.color?.length,
    filters.city || filters.state,
  ].filter(Boolean).length;

  return (
    <section aria-label="Filtros do catálogo">
      <div className="flex items-center gap-2 overflow-x-auto">
        {categories.map((category) => (
          <FilterChip
            key={category.label}
            label={category.label}
            active={filters.category === category.value}
            onToggle={() => updateFilter('category', category.value)}
          />
        ))}

        <FilterToggle
          open={open}
          count={activeCount}
          onClick={() => setOpen((current) => !current)}
        />
      </div>

      {open && (
        <div className="mt-4 grid gap-6 border border-linha bg-branco-quente p-4 tablet:grid-cols-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="font-ui text-body font-semibold text-tinta">Faixa de preço</legend>

            <input
              aria-label="Preço mínimo"
              type="number"
              min="0"
              placeholder="Mínimo"
              value={filters.minPrice ?? ''}
              onChange={(event) =>
                updateFilter(
                  'minPrice',
                  event.target.value ? Number(event.target.value) : undefined,
                )
              }
              className="border border-linha bg-branco-quente px-3 py-2 text-tinta"
            />

            <input
              aria-label="Preço máximo"
              type="number"
              min="0"
              placeholder="Máximo"
              value={filters.maxPrice ?? ''}
              onChange={(event) =>
                updateFilter(
                  'maxPrice',
                  event.target.value ? Number(event.target.value) : undefined,
                )
              }
              className="border border-linha bg-branco-quente px-3 py-2 text-tinta"
            />
          </fieldset>

          <FilterCheckboxGroup
            label="Tamanho"
            options={sizeOptions}
            selected={filters.size}
            onToggle={(value, checked) => toggleOption('size', value, checked)}
          />

          <FilterCheckboxGroup
            label="Marca"
            options={brandOptions}
            selected={filters.brand}
            onToggle={(value, checked) => toggleOption('brand', value, checked)}
          />

          <FilterCheckboxGroup
            label="Conservação"
            options={conditionOptions}
            selected={filters.condition}
            onToggle={(value, checked) => toggleOption('condition', value, checked)}
          />

          <FilterCheckboxGroup
            label="Cor"
            options={colorOptions}
            selected={filters.color}
            onToggle={(value, checked) => toggleOption('color', value, checked)}
          />

          <fieldset className="flex flex-col gap-2">
            <legend className="font-ui text-body font-semibold text-tinta">Localização</legend>

            <input
              aria-label="Cidade"
              type="text"
              placeholder="Cidade"
              value={filters.city ?? ''}
              onChange={(event) => updateFilter('city', event.target.value || undefined)}
              className="border border-linha bg-branco-quente px-3 py-2 text-tinta"
            />

            <input
              aria-label="Estado"
              type="text"
              placeholder="Estado"
              value={filters.state ?? ''}
              onChange={(event) => updateFilter('state', event.target.value || undefined)}
              className="border border-linha bg-branco-quente px-3 py-2 text-tinta"
            />
          </fieldset>
        </div>
      )}
    </section>
  );
}

export default FilterPanel;
