import { httpClient } from '@/services/httpClient';
import type { CatalogFeedResponse, CatalogFilters } from '@/types/catalog';

/**
 * Busca produtos do catálogo aplicando os filtros selecionados.
 * Apenas filtros preenchidos são enviados como query params.
 *
 * O frontend usa camelCase internamente, enquanto a API espera
 * price_min e price_max para a faixa de preço.
 *
 * Usage:
 *   const response = await getProducts({
 *     category: 'roupas',
 *     city: 'Porto Alegre',
 *     minPrice: 50,
 *   });
 */
export async function getProducts(filters: CatalogFilters = {}): Promise<CatalogFeedResponse> {
  const params = new URLSearchParams();

  if (filters.category) params.append('category', filters.category);
  if (filters.minPrice !== undefined) {
    params.append('price_min', String(filters.minPrice));
  }
  if (filters.maxPrice !== undefined) {
    params.append('price_max', String(filters.maxPrice));
  }

  if (filters.city) params.append('city', filters.city);
  if (filters.state) params.append('state', filters.state);

  filters.size?.forEach((size) => params.append('size', size));
  filters.brand?.forEach((brand) => params.append('brand', brand));
  filters.condition?.forEach((condition) => params.append('condition', condition));
  filters.color?.forEach((color) => params.append('color', color));

  const { data } = await httpClient.get<CatalogFeedResponse>('/products', { params });

  return data;
}
