import { useEffect, useState } from 'react';
import { SearchBar } from '@/components/catalog/SearchBar';
import FilterPanel from '@/components/catalog/FilterPanel';
import ActiveFilters from '@/components/catalog/ActiveFilters';
import { search } from '@/services/catalogService';
import type { CatalogFilters } from '@/types/catalog';
import type { FilterParams, Product } from '@/types/product';

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
  const [inputValue, setInputValue] = useState('');
  const [term, setTerm] = useState('');
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    search(term, toFilterParams(filters))
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.total);
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
        <p className="text-body text-vermelho-escuro">Não foi possível carregar os produtos.</p>
      )}

      {!error && !loading && items.length === 0 && (
        <p className="text-body text-texto-auxiliar">Nenhum produto encontrado.</p>
      )}

      <ul className="grid gap-4 tablet:grid-cols-2 web:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-linha bg-branco-quente p-3">
            <p className="font-ui text-body font-bold text-tinta">{item.name}</p>
            <p className="font-ui text-body text-texto-auxiliar">R$ {item.price.toFixed(2)}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default Catalog;
