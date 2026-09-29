import type { CatalogFilters } from '@/types/catalog';
import type { FilterParams } from '@/types/product';

/**
 * Filtros do catálogo na query string (`/catalog?category=Roupas&color=Preto`).
 * Um formato só para quem escreve o link (a interpretação da Vintex,
 * FE-US027-3) e para quem lê (o `Catalog`), para os dois nunca divergirem.
 *
 * Nomes iguais aos de `FilterParams`; preço em reais (`priceMax=100`).
 */
const TEXT_KEYS = [
  'q',
  'category',
  'size',
  'brand',
  'condition',
  'color',
  'city',
  'state',
] as const;
const NUMBER_KEYS = ['priceMin', 'priceMax'] as const;

/**
 * Monta a query string (com `?`, ou vazia) a partir de filtros objetivos.
 *
 * Usage:
 *   `${paths.catalog}${toCatalogSearch({ category: 'Casacos', priceMax: 100 })}`
 *   // → '/catalog?category=Casacos&priceMax=100'
 */
export function toCatalogSearch(filters: FilterParams): string {
  const params = new URLSearchParams();
  for (const key of TEXT_KEYS) {
    const value = filters[key]?.trim();
    if (value) params.set(key, value);
  }
  for (const key of NUMBER_KEYS) {
    const value = filters[key];
    if (value !== undefined && Number.isFinite(value)) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `?${search}` : '';
}

function numberParam(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Lê da URL os filtros do painel do catálogo (`q` fica de fora: o catálogo já
 * o trata como termo de busca). Campo ausente não entra no objeto.
 *
 * Usage:
 *   const [params] = useSearchParams();
 *   const filtros = fromCatalogSearch(params);
 */
export function fromCatalogSearch(params: URLSearchParams): CatalogFilters {
  const text = (key: string) => params.get(key)?.trim() || undefined;
  const list = (key: string) => {
    const value = text(key);
    return value ? [value] : undefined;
  };

  const filters: CatalogFilters = {
    category: text('category'),
    minPrice: numberParam(params, 'priceMin'),
    maxPrice: numberParam(params, 'priceMax'),
    size: list('size'),
    brand: list('brand'),
    condition: list('condition'),
    color: list('color'),
    city: text('city'),
    state: text('state'),
  };

  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  ) as CatalogFilters;
}
