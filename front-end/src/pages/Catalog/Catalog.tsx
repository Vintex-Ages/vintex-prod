import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES, CONDITIONS, COLORS, SIZES } from '@/components/catalog/categories';
import BrandSignature from '@/components/common/BrandSignature';
import FilterPanel from '@/components/catalog/FilterPanel';
import { SearchBar } from '@/components/catalog/SearchBar';
import { SuggestionBlock } from '@/components/catalog/SuggestionBlock';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import { ProductGrid } from '@/components/product/ProductGrid';
import { paths, productDetail } from '@/routes/paths';
import { search } from '@/services/catalogService';
import type { CatalogFilters } from '@/types/catalog';
import type { FilterParams, Product, SearchResult } from '@/types/product';

/**
 * Converte os filtros do painel (múltipla escolha) para o formato aceito
 * pelo catalogService (um valor só por campo). Limitação conhecida: quando
 * o usuário marca mais de um valor no mesmo campo (ex.: tamanho M e G), só
 * o primeiro é enviado à API. Ajustar quando `FilterParams` suportar
 * arrays — débito técnico.
 */
function toFilterParams(filters: CatalogFilters): FilterParams {
  return {
    category: filters.category,
    priceMin: filters.minPrice,
    priceMax: filters.maxPrice,
    size: filters.size?.[0],
    brand: filters.brand?.[0],
    condition: filters.condition?.[0],
    color: filters.color?.[0],
    city: filters.city,
    state: filters.state,
  };
}

/**
 * Catálogo — busca, filtros e grade de peças.
 *
 * Decisões da revisão visual:
 *
 * - **A página passa a ter faixa de conteúdo.** Era a única do produto sem
 *   largura máxima: em 1440px o conteúdo sangrava de ponta a ponta enquanto o
 *   cabeçalho ficava centrado, e o título da página nascia 200px à esquerda da
 *   marca.
 * - **O termo buscado vive na URL** (`/catalog?q=`). Antes ficava só em estado
 *   local: a busca do cabeçalho não tinha como chegar aqui, o resultado não
 *   tinha endereço para compartilhar e o "voltar" do navegador não desfazia a
 *   busca.
 * - **O painel de filtros deixa de abrir vazio.** `FilterPanel` já aceitava as
 *   opções de tamanho, conservação e cor, mas nenhuma tela passava nada — os
 *   grupos apareciam como legendas soltas sem nada embaixo.
 * - **Vazio e erro têm saída** — limpar os filtros e tentar de novo.
 */
function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const categoryParam = searchParams.get('category') || undefined;
  const legacyCategory = categoryParam
    ? undefined
    : CATEGORIES.find((option) => option.value && option.value === query)?.value;
  const term = legacyCategory ? '' : query;
  const category = categoryParam ?? legacyCategory;

  const [inputValue, setInputValue] = useState(term);
  const [filters, setFilters] = useState<CatalogFilters>({ category });
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  /** Motivo das sugestões quando a busca não acha nada (RN-61). */
  const [suggestionReason, setSuggestionReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestSequence = useRef(0);

  // A busca também parte do cabeçalho, que escreve `?q=` e navega para cá. Sem
  // isto o campo da página continuaria mostrando o termo anterior.
  useEffect(() => {
    setInputValue(term);
  }, [term]);

  useEffect(() => {
    if (!legacyCategory) return;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('q');
        next.set('category', legacyCategory);
        return next;
      },
      { replace: true },
    );
  }, [legacyCategory, setSearchParams]);

  useEffect(() => {
    setFilters((current) => (current.category === category ? current : { ...current, category }));
  }, [category]);

  const run = useCallback(() => {
    const requestId = ++requestSequence.current;
    const requestTerm = term;
    const requestFilters = toFilterParams(filters);

    setLoading(true);
    setError(false);
    setSuggestionReason(null);

    search(requestTerm, requestFilters)
      .then((result: SearchResult) => {
        if (requestId !== requestSequence.current) return;
        // `fallback` traz a lista em `suggestions.items` e deixa `items` vazio.
        // Renderizar as sugestões no mesmo grid garante a RN-61: nunca uma tela
        // vazia enquanto houver catálogo.
        const fallback = result.match_type === 'fallback' ? result.suggestions : undefined;
        setItems(fallback ? (fallback.items ?? []) : result.items);
        setTotal(result.total);
        setSuggestionReason(fallback ? fallback.reason : null);
        setError(false);
      })
      .catch(() => {
        if (requestId === requestSequence.current) setError(true);
      })
      .finally(() => {
        if (requestId === requestSequence.current) setLoading(false);
      });

    return () => {
      requestSequence.current += 1;
    };
  }, [term, filters]);

  useEffect(run, [run]);

  function handleSubmit(value: string) {
    const trimmed = value.trim();
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (trimmed) next.set('q', trimmed);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }

  function handleSearchChange(value: string) {
    setInputValue(value);
    const query = value.trim();
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (query) next.set('q', query);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }

  function handleFiltersChange(nextFilters: CatalogFilters) {
    setFilters(nextFilters);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (nextFilters.category) next.set('category', nextFilters.category);
        else next.delete('category');
        return next;
      },
      { replace: true },
    );
  }

  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined && (!Array.isArray(value) || value.length > 0),
  );

  function clearEverything() {
    setFilters({});
    setSearchParams({}, { replace: true });
  }

  return (
    <Container as="main" className="flex flex-col gap-4 pt-6 pb-0 tablet:gap-6 tablet:py-8">
      <div className="-mx-4 -mt-6 tablet:hidden">
        <BrandSignature headingAs="p" />
      </div>

      <div className="flex flex-col gap-4">
        <h1 className="sr-only">Catálogo</h1>

        <SearchBar
          value={inputValue}
          onChange={handleSearchChange}
          onSubmit={handleSubmit}
          loading={loading}
        />
      </div>

      <div className="hidden tablet:block">
        <Link
          to={paths.vintex}
          className="flex min-h-touch items-center justify-between gap-4 bg-vermelho-escuro px-5 py-3 font-ui text-branco-quente transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-branco-quente"
        >
          <span className="font-display text-h4 web:text-h3">Prefere descrever o que procura?</span>
          <span className="inline-flex shrink-0 items-center gap-2 text-body-sm font-semibold underline underline-offset-4">
            Conversar com a Vintex
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path
                d="M5 12h14m-6-6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </Link>
      </div>

      <FilterPanel
        filters={filters}
        onChange={handleFiltersChange}
        sizeOptions={[...SIZES]}
        conditionOptions={[...CONDITIONS]}
        colorOptions={[...COLORS]}
        resultCount={loading ? undefined : total}
      />

      {error ? (
        <ErrorState message="Não foi possível carregar as peças agora." onRetry={run} />
      ) : (
        <>
          {suggestionReason && <SuggestionBlock reason={suggestionReason} />}

          {/*
            Grade do design system, em vez de <li> manual: traz foto, loja, preço em
            pt-BR, skeleton de carregamento, estado vazio e link real para a peça.
          */}
          <ProductGrid
            products={items}
            loading={loading}
            productPath={productDetail}
            // Com `productPath` real, quem navega é o `<Link>` do cartão. Navegar
            // aqui também empilharia duas entradas no histórico e o "voltar" não
            // sairia da peça; `onOpen` fica como ponto de telemetria.
            onOpen={() => {}}
            emptyState={
              <EmptyState
                title={
                  term || hasFilters ? 'Nada com essa combinação' : 'Ainda não há peças por aqui'
                }
                message={
                  term || hasFilters
                    ? 'Tente outro termo ou tire um filtro para ampliar a busca.'
                    : 'Os brechós estão cadastrando o acervo. Volte em instantes.'
                }
                action={
                  term || hasFilters ? (
                    <Button variant="secondary" onClick={clearEverything}>
                      Limpar busca e filtros
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </>
      )}
    </Container>
  );
}

export default Catalog;
