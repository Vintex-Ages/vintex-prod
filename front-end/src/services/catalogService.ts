import { httpClient } from '@/services/httpClient';
import { products as mockProducts } from '@/mocks/products';
import type {
  FilterParams,
  Paginated,
  Product,
  ProductDetail,
  SearchResult,
  Store,
} from '@/types/product';

/**
 * Service único de catálogo (FE-SVC-catalog) — feed, detalhe, filtros e
 * busca. Nenhuma tela chama fetch/axios direto (`.ai/coding-rules.md`);
 * tudo passa por aqui, e a troca mock↔API é só essa flag.
 *
 * Tratamos qualquer valor diferente de `'false'` como mock ativo — assim o
 * projeto continua rodando com mock mesmo sem `.env` local (variável vem
 * `undefined` quando o arquivo não existe).
 */
const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

/** Mesmo default do back (`app/core/pagination.py`, BE-kit-api). */
const DEFAULT_PAGE_SIZE = 20;

interface FeedParams {
  page?: number;
  pageSize?: number;
  sort?: 'recent';
}

/**
 * Erro de catálogo com o mesmo `code` do envelope do back
 * (`app/core/errors.py::ErrorCode`) — quem chama o service trata o mesmo
 * formato de erro estando no mock ou na API real.
 */
export class CatalogError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}

function toProduct({ id, name, price, coverImageUrl, store }: ProductDetail): Product {
  return { id, name, price, coverImageUrl, store };
}

function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Usada por `getProducts`/`search`, nunca por `getProduct` — o detalhe
 * continua acessível para uma peça `vendido` (histórico), só o catálogo
 * público (`get_active_feed` no back) restringe a `ativo`.
 *
 * `state` fica de fora por ora: `Store` ainda não tem esse campo e todas as
 * lojas do seed são do RS — só descarta quando outro estado é pedido
 * explicitamente.
 */
function matchesFilters(product: ProductDetail, filters: FilterParams): boolean {
  if (product.status !== 'ativo') return false;
  if (filters.category && product.category !== filters.category) return false;
  if (filters.size && product.size !== filters.size) return false;
  if (filters.brand && product.brand !== filters.brand) return false;
  if (filters.condition && product.condition !== filters.condition) return false;
  if (filters.color && product.color !== filters.color) return false;
  if (filters.city && product.store.city !== filters.city) return false;
  if (filters.state && filters.state.toUpperCase() !== 'RS') return false;
  if (filters.priceMin !== undefined && product.price < filters.priceMin) return false;
  if (filters.priceMax !== undefined && product.price > filters.priceMax) return false;
  return true;
}

function matchesQuery(product: ProductDetail, q: string): boolean {
  const needle = normalize(q);
  return [product.name, product.brand, product.category].some((field) =>
    normalize(field).includes(needle),
  );
}

function productNotFound(id: string): CatalogError {
  return new CatalogError('PRODUCT_NOT_FOUND', `Produto ${id} não encontrado.`);
}

// ---- mock ----

function mockGetFeed({ page = 1, pageSize = DEFAULT_PAGE_SIZE }: FeedParams): Paginated<Product> {
  const active = mockProducts.filter((product) => product.status === 'ativo');
  const recent = [...active].reverse();
  return paginate(recent.map(toProduct), page, pageSize);
}

function mockGetProduct(id: string): Promise<ProductDetail> {
  const product = mockProducts.find((item) => item.id === id);
  return product ? Promise.resolve(product) : Promise.reject(productNotFound(id));
}

function mockGetProducts(filters: FilterParams): Paginated<Product> {
  let matches = mockProducts.filter((product) => matchesFilters(product, filters));
  if (filters.q) {
    matches = matches.filter((product) => matchesQuery(product, filters.q as string));
  }
  return paginate(matches.map(toProduct), 1, DEFAULT_PAGE_SIZE);
}

function mockSearch(q: string, filters: FilterParams): SearchResult {
  const filtered = mockProducts.filter((product) => matchesFilters(product, filters));
  const matched = filtered.filter((product) => matchesQuery(product, q));

  if (matched.length > 0) {
    return { match_type: 'exact', items: matched.map(toProduct), total: matched.length };
  }

  return {
    match_type: 'fallback',
    items: [],
    suggestions: {
      reason: `Nenhum resultado para "${q}". Veja outras peças disponíveis.`,
      items: filtered.slice(0, 4).map(toProduct),
    },
    total: 0,
  };
}

// ---- API real ----
// GET /products (feed/filtros/busca) e GET /products/{id} (detalhe) ainda
// estão em desenvolvimento no back (branches feature/85, feature/87 — sem
// `q`, `city`, `state` nem endpoint de detalhe até agora). O mapeamento
// abaixo segue o que já está confirmado (feed) e assume o resto pelo
// contrato desta ticket; revisar quando o back entregar.

interface ApiStore {
  id: number | string;
  name: string;
  city?: string;
  verified?: boolean;
}

interface ApiFeedItem {
  id: number | string;
  name: string;
  price: number;
  cover_image_url: string | null;
  store: ApiStore;
}

interface ApiProductDetail extends ApiFeedItem {
  category: string;
  size: string;
  color: string;
  brand: string;
  condition: string;
  description: string;
  status: 'ativo' | 'vendido';
  images: { image_url: string; position: number }[];
}

interface ApiPage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string };
}

function mapStore(store: ApiStore): Store {
  return { id: String(store.id), name: store.name, city: store.city, verified: store.verified };
}

function mapFeedItem(item: ApiFeedItem): Product {
  return {
    id: String(item.id),
    name: item.name,
    price: item.price,
    coverImageUrl: item.cover_image_url,
    store: mapStore(item.store),
  };
}

function mapProductDetail(item: ApiProductDetail): ProductDetail {
  return {
    ...mapFeedItem(item),
    category: item.category,
    size: item.size,
    color: item.color,
    brand: item.brand,
    condition: item.condition,
    description: item.description,
    status: item.status,
    media: item.images.map((image) => ({
      type: 'image',
      url: image.image_url,
      position: image.position,
    })),
  };
}

function mapPage<TApi, T>(page: ApiPage<TApi>, mapItem: (item: TApi) => T): Paginated<T> {
  return {
    items: page.items.map(mapItem),
    page: page.page,
    pageSize: page.page_size,
    total: page.total,
  };
}

function toApiParams(filters: FilterParams): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  if (filters.category) params.category = filters.category;
  if (filters.priceMin !== undefined) params.price_min = filters.priceMin;
  if (filters.priceMax !== undefined) params.price_max = filters.priceMax;
  if (filters.size) params.size = filters.size;
  if (filters.brand) params.brand = filters.brand;
  if (filters.condition) params.condition = filters.condition;
  if (filters.color) params.color = filters.color;
  if (filters.city) params.city = filters.city;
  if (filters.state) params.state = filters.state;
  if (filters.q) params.q = filters.q;
  if (filters.sort) params.sort = filters.sort;
  return params;
}

/** Normaliza erro do axios pro mesmo `CatalogError` do caminho mock. */
function toCatalogError(error: unknown): CatalogError {
  const data = (error as { response?: { data?: ApiErrorEnvelope } }).response?.data;
  if (data?.error?.code) {
    return new CatalogError(data.error.code, data.error.message ?? 'Erro ao consultar produto.');
  }
  return new CatalogError('INTERNAL_ERROR', 'Erro ao consultar produto.');
}

async function apiGetFeed({
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  sort = 'recent',
}: FeedParams): Promise<Paginated<Product>> {
  const { data } = await httpClient.get<ApiPage<ApiFeedItem>>('/products', {
    params: { page, page_size: pageSize, sort },
  });
  return mapPage(data, mapFeedItem);
}

async function apiGetProducts(filters: FilterParams): Promise<Paginated<Product>> {
  const { data } = await httpClient.get<ApiPage<ApiFeedItem>>('/products', {
    params: toApiParams(filters),
  });
  return mapPage(data, mapFeedItem);
}

async function apiGetProduct(id: string): Promise<ProductDetail> {
  try {
    const { data } = await httpClient.get<ApiProductDetail>(`/products/${id}`);
    return mapProductDetail(data);
  } catch (error) {
    throw toCatalogError(error);
  }
}

/**
 * O back não tem endpoint de busca com fallback ainda — este adapter
 * reaproveita o feed filtrado: sem `q` acha algo, é `exact`; sem achar nada,
 * repete a consulta sem `q` e usa isso como sugestão. Revisar quando existir
 * um endpoint de busca real (hoje só há filtros combinados em feature/87).
 */
async function apiSearch(q: string, filters: FilterParams): Promise<SearchResult> {
  const withQuery = await apiGetProducts({ ...filters, q });
  if (withQuery.items.length > 0) {
    return { match_type: 'exact', items: withQuery.items, total: withQuery.total };
  }

  const fallback = await apiGetProducts(filters);
  return {
    match_type: 'fallback',
    items: [],
    suggestions: {
      reason: `Nenhum resultado para "${q}". Veja outras peças disponíveis.`,
      items: fallback.items.slice(0, 4),
    },
    total: 0,
  };
}

// ---- API pública do service ----

export function getFeed(params: FeedParams = {}): Promise<Paginated<Product>> {
  return useMocks ? Promise.resolve(mockGetFeed(params)) : apiGetFeed(params);
}

export function getProduct(id: string): Promise<ProductDetail> {
  return useMocks ? mockGetProduct(id) : apiGetProduct(id);
}

export function getProducts(filters: FilterParams = {}): Promise<Paginated<Product>> {
  return useMocks ? Promise.resolve(mockGetProducts(filters)) : apiGetProducts(filters);
}

export function search(q: string, filters: FilterParams = {}): Promise<SearchResult> {
  return useMocks ? Promise.resolve(mockSearch(q, filters)) : apiSearch(q, filters);
}
