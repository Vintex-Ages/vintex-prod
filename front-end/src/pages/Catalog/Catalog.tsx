import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchBar } from '@/components/catalog/SearchBar';
import { SuggestionBlock } from '@/components/catalog/SuggestionBlock';
import { ProductGrid } from '@/components/product/ProductGrid';
import { search } from '@/services/catalogService';
import { productDetail } from '@/routes/paths';
import type { SearchResult } from '@/types/product';

/**
 * Tela de catálogo (FE-US010-2, #83). Busca produtos via `catalogService.search`
 * e reage ao `match_type` do resultado: `'exact'` renderiza `result.items` no
 * `ProductGrid` normalmente; `'fallback'` renderiza `SuggestionBlock` com o
 * motivo acima do grid e usa `result.suggestions.items` (não `result.items`,
 * que vem vazio) — assim o `ProductGrid` nunca mostra seu `EmptyState` interno
 * enquanto houver sugestões.
 *
 * Antes da primeira busca, mostra só o título e o `SearchBar`.
 *
 * Usage:
 *   import Catalog from '@/pages/Catalog/Catalog';
 *   <Catalog />
 */
function Catalog() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      const searchResult = await search(trimmed, {});
      setResult(searchResult);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen(id: string) {
    navigate(productDetail(id));
  }

  return (
    <main>
      <h1>Catálogo</h1>
      <SearchBar value={term} onChange={setTerm} onSubmit={handleSubmit} loading={loading} />

      {result?.match_type === 'fallback' && result.suggestions && (
        <SuggestionBlock reason={result.suggestions.reason} />
      )}

      {result && (
        <ProductGrid
          products={
            result.match_type === 'fallback' ? (result.suggestions?.items ?? []) : result.items
          }
          onOpen={handleOpen}
        />
      )}
    </main>
  );
}

export default Catalog;
