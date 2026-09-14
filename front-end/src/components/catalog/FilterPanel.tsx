import { useEffect, useState } from 'react';
import { FilterChip } from '@/components/catalog/FilterChip';
import { CATEGORIES } from '@/components/catalog/categories';
import FilterToggle from '@/components/catalog/FilterToggle';
import IconButton from '@/components/common/IconButton';
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

/**
 * Painel de filtros do catálogo.
 * Mantém somente o estado visual de abertura e envia alterações ao componente pai.
 * No mobile (foco da Sprint 1), o painel aberto vira um drawer sobre o catálogo;
 * em telas maiores continua inline, abaixo do toggle.
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

  /**
   * Escape fecha o drawer, como o `LoginInterceptor` já faz. Sem isso, no
   * celular o painel aberto só fecha tocando no fundo, e quem navega por
   * teclado fica sem saída: o `FilterToggle` fica coberto pelo backdrop.
   */
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

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
        {CATEGORIES.map((category) => (
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
        <div
          data-testid="drawer-backdrop"
          className="fixed inset-0 z-10 bg-tinta/40 tablet:static tablet:bg-transparent"
          onClick={() => setOpen(false)}
        >
          <div
            className="fixed inset-x-0 bottom-0 z-20 grid max-h-[85dvh] gap-6 overflow-y-auto rounded-none border border-linha bg-branco-quente p-4 tablet:static tablet:mt-4 tablet:max-h-none tablet:grid-cols-2 tablet:overflow-visible tablet:border"
            onClick={(event) => event.stopPropagation()}
          >
            {/*
              Botão de fechar só no drawer: a partir de `tablet:` o painel é
              inline e quem fecha é o próprio `FilterToggle`, que ali não fica
              coberto por backdrop nenhum.
            */}
            <div className="flex justify-end tablet:hidden">
              <IconButton
                icon={
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  </svg>
                }
                ariaLabel="Fechar filtros"
                onClick={() => setOpen(false)}
              />
            </div>

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
        </div>
      )}
    </section>
  );
}

export default FilterPanel;
