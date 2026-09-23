import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ActiveFilters from '@/components/catalog/ActiveFilters';
import { CONDITIONS, COLORS, SIZES } from '@/components/catalog/categories';
import FilterPanel from '@/components/catalog/FilterPanel';
import { SearchBar } from '@/components/catalog/SearchBar';
import { SuggestionBlock } from '@/components/catalog/SuggestionBlock';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import { ProductGrid } from '@/components/product/ProductGrid';
import { VintexSearchSpotlight } from '@/components/vintex-ai/VintexSearchSpotlight';
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const term = searchParams.get('q') ?? '';

  const [inputValue, setInputValue] = useState(term);
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  /** Motivo das sugestões quando a busca não acha nada (RN-61). */
  const [suggestionReason, setSuggestionReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // A busca também parte do cabeçalho, que escreve `?q=` e navega para cá. Sem
  // isto o campo da página continuaria mostrando o termo anterior.
  useEffect(() => {
    setInputValue(term);
  }, [term]);

  const run = useCallback(() => {
    let active = true;
    setLoading(true);

    search(term, toFilterParams(filters))
      .then((result: SearchResult) => {
        if (!active) return;
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
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [term, filters]);

  useEffect(run, [run]);

  function handleSubmit(value: string) {
    const trimmed = value.trim();
    setSearchParams(trimmed ? { q: trimmed } : {}, { replace: true });
  }

  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined && (!Array.isArray(value) || value.length > 0),
  );

  function clearEverything() {
    setFilters({});
    setSearchParams({}, { replace: true });
  }

  return (
    <Container as="main" className="flex flex-col gap-6 py-6 tablet:py-8">
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-h2 text-tinta">Catálogo</h1>

        <SearchBar
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          loading={loading}
        />
      </div>

      {/*
        #207: caminho em destaque para a IA, a partir do `tablet`
        (RN-94/RN-54) — no mobile o FAB já cobre esse papel. A SearchBar
        tradicional acima continua visível em todo breakpoint: a IA é um
        caminho a mais, não o único.
      */}
      <div className="hidden tablet:block">
        <VintexSearchSpotlight
          size="compact"
          headingAs="h2"
          heading="Prefere descrever o que procura?"
          eyebrow=""
          isOnline={false}
          suggestions={[]}
          placeholder="Descreva a peça ou o estilo..."
          onSubmit={(query) => navigate(paths.vintex, { state: { message: query } })}
        />
      </div>

      <div className="flex flex-col gap-3">
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          sizeOptions={[...SIZES]}
          conditionOptions={[...CONDITIONS]}
          colorOptions={[...COLORS]}
          resultCount={loading ? undefined : total}
        />

        <ActiveFilters filters={filters} onChange={setFilters} total={total} loading={loading} />
      </div>

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
