import { useEffect, useState } from 'react';
import { FilterChip } from '@/components/catalog/FilterChip';
import { CATEGORIES } from '@/components/catalog/categories';
import FilterToggle from '@/components/catalog/FilterToggle';
import Button from '@/components/common/Button';
import IconButton from '@/components/common/IconButton';
import Select, { type SelectOption } from '@/components/common/Select';
import FilterCheckboxGroup from '@/components/catalog/FilterCheckboxGroup';
import type { CatalogFilters, StoreLocation } from '@/types/catalog';
import { formatPieceCount } from '@/utils/format';

type FilterPanelProps = {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  sizeOptions?: string[];
  brandOptions?: string[];
  conditionOptions?: string[];
  colorOptions?: string[];
  /** Cidades e UFs que existem nas lojas; vazio deixa só "Todas"/"Todos". */
  locationOptions?: StoreLocation[];
  /** Quantas peças o filtro atual devolve; também indica carregamento quando omitido. */
  resultCount?: number;
};

/** Valores sem repetição, na ordem em que chegaram. */
function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Opções do select. O valor ativo que não está na lista (veio da URL, ou a loja
 * saiu) continua como opção, para ficar visível e removível.
 */
function toOptions(values: string[], current: string | undefined): SelectOption[] {
  const all = current && !values.includes(current) ? [...values, current] : values;
  return all.map((value) => ({ value, label: value }));
}

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
  locationOptions = [],
  resultCount,
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

  const stateOptions = unique(locationOptions.map((location) => location.state));
  const cityOptions = unique(
    locationOptions
      .filter((location) => !filters.state || location.state === filters.state)
      .map((location) => location.city),
  );

  /** Cidade escolhida leva a UF dela, para não misturar homônimas de outro estado. */
  const changeCity = (city: string | undefined) => {
    const state = locationOptions.find((location) => location.city === city)?.state;
    onChange({ ...filters, city, state: state ?? filters.state });
  };

  /** Trocar a UF tira a cidade que não pertence a ela. */
  const changeState = (state: string | undefined) => {
    const keepsCity =
      !state ||
      locationOptions.some(
        (location) => location.state === state && location.city === filters.city,
      );
    onChange({ ...filters, state, city: keepsCity ? filters.city : undefined });
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
      <div className="-mx-4 flex flex-nowrap items-center gap-2 overflow-x-auto px-4 hide-scrollbar tablet:-mx-6 tablet:px-6 web:-mx-8 web:px-8">
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
      <p aria-live="polite" className="mt-4 text-right font-ui text-body-sm text-texto-auxiliar">
        {typeof resultCount === 'number'
          ? `${formatPieceCount(resultCount)} ${resultCount === 1 ? 'encontrada' : 'encontradas'}`
          : 'Buscando peças…'}
      </p>

      {open && (
        <div
          data-testid="drawer-backdrop"
          className="fixed inset-0 z-40 bg-tinta/40 tablet:static tablet:z-auto tablet:bg-transparent"
          onClick={() => setOpen(false)}
        >
          <div
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-none border border-linha bg-branco-quente tablet:static tablet:z-auto tablet:mt-4 tablet:max-h-none tablet:border"
            onClick={(event) => event.stopPropagation()}
          >
            {/*
              Cabeçalho da folha, só no celular: a partir de `tablet:` o painel é
              inline e quem fecha é o próprio `FilterToggle`, que ali não fica
              coberto por backdrop nenhum. Antes o "×" ficava sozinho numa faixa
              vazia, sem dizer o que a folha era.
            */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-linha px-4 py-3 tablet:hidden">
              <h2 className="font-display text-h4 text-tinta">Filtros</h2>
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

            <div className="grid gap-x-10 gap-y-6 overflow-y-auto p-4 tablet:grid-cols-2 tablet:overflow-visible tablet:p-6">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 font-ui text-h4 font-semibold text-tinta">
                  Faixa de preço
                </legend>

                {/*
                  Lado a lado: são um par (de/até) e ocupavam duas linhas inteiras
                  de uma folha que já é longa. O rótulo fica visível em vez de
                  viver só no `placeholder`, que some assim que se digita.
                */}
                <div className="flex items-end gap-3">
                  <label className="flex flex-1 flex-col gap-1 text-label text-texto-auxiliar">
                    Mínimo
                    <input
                      aria-label="Preço mínimo"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="R$ 0"
                      value={filters.minPrice ?? ''}
                      onChange={(event) =>
                        updateFilter(
                          'minPrice',
                          event.target.value ? Number(event.target.value) : undefined,
                        )
                      }
                      className="min-h-touch w-full border border-linha bg-branco-quente px-3 py-2 text-body text-tinta placeholder:text-texto-auxiliar focus:border-tinta focus:outline-none focus:ring-1 focus:ring-tinta"
                    />
                  </label>

                  <span aria-hidden="true" className="pb-3 text-texto-auxiliar">
                    –
                  </span>

                  <label className="flex flex-1 flex-col gap-1 text-label text-texto-auxiliar">
                    Máximo
                    <input
                      aria-label="Preço máximo"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder="Sem limite"
                      value={filters.maxPrice ?? ''}
                      onChange={(event) =>
                        updateFilter(
                          'maxPrice',
                          event.target.value ? Number(event.target.value) : undefined,
                        )
                      }
                      className="min-h-touch w-full border border-linha bg-branco-quente px-3 py-2 text-body text-tinta placeholder:text-texto-auxiliar focus:border-tinta focus:outline-none focus:ring-1 focus:ring-tinta"
                    />
                  </label>
                </div>
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

              {/*
                Localização (FE-US009-5, #336): escolha única, com as cidades e
                UFs que existem nas lojas. Escolher a cidade leva a UF dela, e
                trocar a UF tira a cidade que não é dela.
              */}
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 font-ui text-h4 font-semibold text-tinta">
                  Localização
                </legend>

                <Select
                  id="filtro-estado"
                  label="Estado"
                  placeholder="Todos os estados"
                  value={filters.state ?? null}
                  options={toOptions(stateOptions, filters.state)}
                  onChange={(state) => changeState(state ?? undefined)}
                />

                <Select
                  id="filtro-cidade"
                  label="Cidade"
                  placeholder="Todas as cidades"
                  value={filters.city ?? null}
                  options={toOptions(cityOptions, filters.city)}
                  onChange={(city) => changeCity(city ?? undefined)}
                />
              </fieldset>
            </div>

            {/*
              Saída da folha no celular. Sem ela, quem desce até o fim da lista de
              filtros só sai rolando de volta até o "×" do topo ou tocando no
              fundo — e o fundo, depois da rolagem, nem sempre está visível.
              Os filtros já se aplicam na hora, então o botão só fecha.
            */}
            <div className="shrink-0 border-t border-linha p-4 tablet:hidden">
              <Button fullWidth onClick={() => setOpen(false)}>
                {typeof resultCount === 'number'
                  ? `Ver ${formatPieceCount(resultCount)}`
                  : 'Ver resultados'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default FilterPanel;
