import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchBar } from '@/components/catalog/SearchBar';
import { SuggestionBlock } from '@/components/catalog/SuggestionBlock';
import { ProductGrid } from '@/components/product/ProductGrid';
import FilterPanel from '@/components/catalog/FilterPanel';
import ActiveFilters from '@/components/catalog/ActiveFilters';
import { search } from '@/services/catalogService';
import type { CatalogFilters } from '@/types/catalog';
import { productDetail } from '@/routes/paths';
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

function Catalog() {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [term, setTerm] = useState('');
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  /** Motivo das sugestões quando a busca não acha nada (RN-61). */
  const [suggestionReason, setSuggestionReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
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

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="font-display text-h2 text-tinta">Catálogo</h1>

      <SearchBar value={inputValue} onChange={setInputValue} onSubmit={setTerm} loading={loading} />

      <FilterPanel filters={filters} onChange={setFilters} />

      <ActiveFilters filters={filters} onChange={setFilters} total={total} />

      {error && (
        <p role="alert" className="text-body text-vermelho-escuro">
          Não foi possível carregar os produtos.
        </p>
      )}

      {!error && suggestionReason && <SuggestionBlock reason={suggestionReason} />}

      {/*
        Grade do design system, em vez de <li> manual: traz foto, loja, preço em
        pt-BR, skeleton de carregamento, estado vazio e link real para a peça.
        O #169 relaxou o tipo do ProductCard para aceitar `Product`, então o
        resultado da busca encaixa direto.
      */}
      {!error && (
        <ProductGrid
          products={items}
          loading={loading}
          onOpen={(id) => navigate(productDetail(id))}
        />
      )}
    </main>
  );
}

export default Catalog;
