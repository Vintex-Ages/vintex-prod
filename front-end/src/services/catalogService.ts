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

function mockGetFeedWithDetails({
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: FeedParams): Paginated<ProductDetail> {
  const active = mockProducts.filter((product) => product.status === 'ativo');
  const recent = [...active].reverse();
  return paginate(recent, page, pageSize);
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
// Contrato confirmado pelo time de back (mensagem de alinhamento das tasks
// de service, 2026-09-11): `GET /products` devolve `FeedResponse` sem `q` e
// `SearchResponse` (já com match_type/suggestions prontos) com `q`; `GET
// /products/{id}` devolve o detalhe. `style` continua fora do tipo do front —
// a ticket não pede e não há consumidor ainda. `store.logo_url`/`verified`
// SUPOSIÇÃO a confirmar com o back: a FE-US012-1 (card da loja no detalhe)
// passou a consumir os dois, mas não há contrato formal publicado pra eles —
// tratamos como opcionais até confirmar.

interface ApiStore {
  id: number | string;
  name: string;
  logo_url?: string;
  verified?: boolean;
}

interface ApiFeedItem {
  id: number | string;
  name: string;
  price: number;
  cover_image_url: string | null;
  store: ApiStore;
}

/**
 * Diferente do item de lista: `city`/`state` vêm soltos no produto (não em
 * `store`), e `media` já chega no formato que `ProductMedia` espera — sem
 * conversão extra, ao contrário do que eu tinha assumido antes de ver o
 * contrato real.
 */
interface ApiProductDetail {
  id: number | string;
  name: string;
  description: string;
  category: string;
  brand: string;
  color: string;
  size: string;
  condition: string;
  price: number;
  status: 'ativo' | 'vendido' | 'despublicado';
  city: string;
  state: string;
  media: { type: 'image' | 'video'; url: string; position: number }[];
  store: ApiStore;
}

interface ApiPage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

interface ApiSearchResponse {
  items: ApiFeedItem[];
  total: number;
  match_type: 'exact' | 'fallback';
  suggestions: { reason: string; items: ApiFeedItem[] } | null;
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string };
}

function mapStore(store: ApiStore, city?: string): Store {
  return {
    id: String(store.id),
    name: store.name,
    city,
    verified: store.verified,
    logoUrl: store.logo_url,
  };
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

/** Capa = primeira imagem por `position`, igual o back já faz no feed (`get_active_feed`). */
function mapProductDetail(item: ApiProductDetail): ProductDetail {
  const cover = [...item.media].sort((a, b) => a.position - b.position)[0]?.url ?? null;
  return {
    id: String(item.id),
    name: item.name,
    price: item.price,
    coverImageUrl: cover,
    store: mapStore(item.store, item.city),
    category: item.category,
    size: item.size,
    color: item.color,
    brand: item.brand,
    condition: item.condition,
    description: item.description,
    status: item.status,
    media: item.media,
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

/**
 * Débito técnico: o feed não devolve `category`/`condition` (só o detalhe
 * devolve), mas o card do Figma precisa dos dois. Enquanto o back não passa a
 * devolver tudo no feed, buscamos o detalhe de cada item da página pra
 * completar — 1 request de feed + N de detalhe por página. Item cujo detalhe
 * falhar é descartado da página (não derruba os demais).
 */
async function apiGetFeedWithDetails(params: FeedParams): Promise<Paginated<ProductDetail>> {
  const feedPage = await apiGetFeed(params);
  const settled = await Promise.allSettled(feedPage.items.map((item) => apiGetProduct(item.id)));

  const items = settled
    .filter(
      (result): result is PromiseFulfilledResult<ProductDetail> => result.status === 'fulfilled',
    )
    .map((result) => result.value);

  const failed = settled.length - items.length;
  if (failed > 0) {
    console.warn(
      `[catalogService] ${failed} produto(s) do feed sem detalhe disponível — descartado(s) da página.`,
    );
  }

  return { ...feedPage, items };
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

async function apiSearch(q: string, filters: FilterParams): Promise<SearchResult> {
  const { data } = await httpClient.get<ApiSearchResponse>('/products', {
    params: toApiParams({ ...filters, q }),
  });
  return {
    match_type: data.match_type,
    items: data.items.map(mapFeedItem),
    total: data.total,
    suggestions: data.suggestions
      ? { reason: data.suggestions.reason, items: data.suggestions.items.map(mapFeedItem) }
      : undefined,
  };
}

// ---- API pública do service ----

export function getFeed(params: FeedParams = {}): Promise<Paginated<Product>> {
  return useMocks ? Promise.resolve(mockGetFeed(params)) : apiGetFeed(params);
}

/** Feed já enriquecido com `category`/`condition`, pro card do catálogo (ver nota de débito técnico acima). */
export function getFeedWithDetails(params: FeedParams = {}): Promise<Paginated<ProductDetail>> {
  return useMocks ? Promise.resolve(mockGetFeedWithDetails(params)) : apiGetFeedWithDetails(params);
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
