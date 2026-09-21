import { httpClient } from '@/services/httpClient';
import { products as mockProducts } from '@/mocks/products';
import type { Paginated, Product } from '@/types/product';
import type { StoreInput, StoreMetrics, StoreProfile, StoreVerification } from '@/types/store';

/**
 * Service de loja do vendedor (FE-SVC-store, issue #201) — criação, perfil
 * próprio/público, verificação (Selo Confiável, `.ai/glossary.md`) e peças da
 * loja. Segue o mesmo padrão de `catalogService.ts`: flag `VITE_USE_MOCKS`,
 * branch mock vs. API real, erros normalizados em `StoreError`.
 */
const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

/** Mesmo default do back (`app/core/pagination.py`, BE-kit-api). */
const DEFAULT_PAGE_SIZE = 20;

/**
 * Chave de `sessionStorage` com a loja do vendedor atual — loja por sessão,
 * não por id de usuário: só existe uma sessão mock ativa por vez, então não
 * há necessidade de vincular por usuário.
 */
const STORE_STORAGE_KEY = 'vintex.store.mine';

interface StoreProductsParams {
  page?: number;
  pageSize?: number;
}

/**
 * Erro de loja com o mesmo `code` do envelope do back
 * (`app/core/errors.py::ErrorCode`) — quem chama o service trata o mesmo
 * formato de erro estando no mock ou na API real.
 */
export class StoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

function storeNotCreated(): StoreError {
  return new StoreError('STORE_NOT_FOUND', 'Nenhuma loja foi criada para o usuário atual.');
}

function storeNotFound(id: string): StoreError {
  return new StoreError('STORE_NOT_FOUND', `Loja ${id} não encontrada.`);
}

function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

function toStoreProduct({ id, name, price, coverImageUrl, store }: Product): Product {
  return { id, name, price, coverImageUrl, store };
}

// ---- mock ----

let mockIdSeq = 0;

function nextMockId(): string {
  mockIdSeq += 1;
  return `store-mock-${mockIdSeq}`;
}

function readStoredStore(): StoreProfile | null {
  try {
    const raw = window.sessionStorage.getItem(STORE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoreProfile) : null;
  } catch {
    return null;
  }
}

function writeStoredStore(store: StoreProfile): void {
  try {
    window.sessionStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Sem storage disponível: loja mockada fica só em memória.
  }
}

function mockCreateStore(input: StoreInput): StoreProfile {
  const store: StoreProfile = {
    id: nextMockId(),
    name: input.name,
    description: input.description,
    logoUrl: null,
    city: input.address.city,
    state: input.address.state,
    verification: 'pendente',
    createdAt: new Date().toISOString(),
  };
  writeStoredStore(store);
  return store;
}

function mockGetMyStore(): StoreProfile | null {
  return readStoredStore();
}

function mockRequestVerification(): StoreProfile {
  const store = readStoredStore();
  if (!store) {
    throw storeNotCreated();
  }
  const verified: StoreProfile = { ...store, verification: 'confiavel' };
  writeStoredStore(verified);
  return verified;
}

/**
 * Sem loja própria com esse `id`, procura em `mocks/products.ts` um produto
 * cujo `store.id` bata — o perfil público é montado a partir do `Store`
 * embutido no produto, já que o mock de catálogo não tem uma lista de lojas
 * separada.
 */
function mockGetStore(id: string): StoreProfile {
  const mine = readStoredStore();
  if (mine && mine.id === id) {
    return mine;
  }

  const product = mockProducts.find((item) => item.store.id === id);
  if (!product) {
    throw storeNotFound(id);
  }

  const { store } = product;
  return {
    id: store.id,
    name: store.name,
    description: 'Brechó com curadoria de peças únicas.',
    logoUrl: store.logoUrl ?? null,
    city: store.city ?? '',
    state: 'RS',
    verification: store.verified ? 'confiavel' : 'pendente',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

/** Só peças `ativo` aparecem — vendidas/despublicadas ficam de fora do perfil público. */
function mockGetStoreProducts(
  id: string,
  { page = 1, pageSize = DEFAULT_PAGE_SIZE }: StoreProductsParams,
): Paginated<Product> {
  const items = mockProducts
    .filter((product) => product.store.id === id && product.status === 'ativo')
    .map(toStoreProduct);
  return paginate(items, page, pageSize);
}

// ---- API real ----
// PROPOSTA do front — endpoints ainda sem contrato confirmado com o time de
// back (ver "decisões pendentes" em `.ai/architecture.md`); estrutura
// simétrica ao mock, pronta para ligar assim que o contrato for validado.
// `POST /stores` vai como multipart quando há `logo`, JSON caso contrário.

interface ApiStoreMetrics {
  active_products: number;
  sold_products: number;
  months_on_platform: number;
  shipping_without_complaint_rate?: number;
  rating?: number;
}

interface ApiStoreProfile {
  id: number | string;
  name: string;
  description: string;
  logo_url: string | null;
  city: string;
  state: string;
  verification: StoreVerification;
  created_at: string;
  metrics?: ApiStoreMetrics;
}

interface ApiStoreProductItem {
  id: number | string;
  name: string;
  price: number;
  cover_image_url: string | null;
  store: {
    id: number | string;
    name: string;
    city?: string;
    verified?: boolean;
    logo_url?: string;
    verification?: StoreVerification;
  };
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

function mapStoreMetrics(metrics: ApiStoreMetrics): StoreMetrics {
  return {
    activeProducts: metrics.active_products,
    soldProducts: metrics.sold_products,
    monthsOnPlatform: metrics.months_on_platform,
    shippingWithoutComplaintRate: metrics.shipping_without_complaint_rate,
    rating: metrics.rating,
  };
}

function mapStoreProfile(store: ApiStoreProfile): StoreProfile {
  return {
    id: String(store.id),
    name: store.name,
    description: store.description,
    logoUrl: store.logo_url,
    city: store.city,
    state: store.state,
    verification: store.verification,
    createdAt: store.created_at,
    metrics: store.metrics ? mapStoreMetrics(store.metrics) : undefined,
  };
}

function mapStoreProductItem(item: ApiStoreProductItem): Product {
  return {
    id: String(item.id),
    name: item.name,
    price: item.price,
    coverImageUrl: item.cover_image_url,
    store: {
      id: String(item.store.id),
      name: item.store.name,
      city: item.store.city,
      verified: item.store.verified,
      logoUrl: item.store.logo_url,
      verification: item.store.verification,
    },
  };
}

/** Normaliza erro do axios pro mesmo `StoreError` do caminho mock. */
function toStoreError(error: unknown): StoreError {
  const data = (error as { response?: { data?: ApiErrorEnvelope } }).response?.data;
  if (data?.error?.code) {
    return new StoreError(data.error.code, data.error.message ?? 'Erro ao consultar loja.');
  }
  return new StoreError('INTERNAL_ERROR', 'Erro ao consultar loja.');
}

function toStoreFormData(input: StoreInput): FormData {
  const formData = new FormData();
  formData.append('name', input.name);
  formData.append('description', input.description);
  formData.append('document_type', input.document.type);
  formData.append('document_number', input.document.number);
  formData.append('pix_key', input.pixKey);
  formData.append('address', JSON.stringify(input.address));
  if (input.acceptedContractVersion) {
    formData.append('accepted_contract_version', input.acceptedContractVersion);
  }
  if (input.logo) {
    formData.append('logo', input.logo);
  }
  return formData;
}

async function apiCreateStore(input: StoreInput): Promise<StoreProfile> {
  try {
    const { data } = input.logo
      ? await httpClient.post<ApiStoreProfile>('/stores', toStoreFormData(input), {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      : await httpClient.post<ApiStoreProfile>('/stores', {
          name: input.name,
          description: input.description,
          document_type: input.document.type,
          document_number: input.document.number,
          pix_key: input.pixKey,
          address: input.address,
          accepted_contract_version: input.acceptedContractVersion,
        });
    return mapStoreProfile(data);
  } catch (error) {
    throw toStoreError(error);
  }
}

async function apiGetMyStore(): Promise<StoreProfile | null> {
  try {
    const { data } = await httpClient.get<ApiStoreProfile>('/stores/me');
    return mapStoreProfile(data);
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404) {
      return null;
    }
    throw toStoreError(error);
  }
}

async function apiRequestVerification(): Promise<StoreProfile> {
  try {
    const { data } = await httpClient.post<ApiStoreProfile>('/stores/me/verification');
    return mapStoreProfile(data);
  } catch (error) {
    throw toStoreError(error);
  }
}

async function apiGetStore(id: string): Promise<StoreProfile> {
  try {
    const { data } = await httpClient.get<ApiStoreProfile>(`/stores/${id}`);
    return mapStoreProfile(data);
  } catch (error) {
    throw toStoreError(error);
  }
}

async function apiGetStoreProducts(
  id: string,
  { page = 1, pageSize = DEFAULT_PAGE_SIZE }: StoreProductsParams,
): Promise<Paginated<Product>> {
  try {
    const { data } = await httpClient.get<ApiPage<ApiStoreProductItem>>(`/stores/${id}/products`, {
      params: { page, page_size: pageSize },
    });
    return {
      items: data.items.map(mapStoreProductItem),
      page: data.page,
      pageSize: data.page_size,
      total: data.total,
    };
  } catch (error) {
    throw toStoreError(error);
  }
}

// ---- API pública do service ----

export async function createStore(input: StoreInput): Promise<StoreProfile> {
  return useMocks ? mockCreateStore(input) : apiCreateStore(input);
}

export async function getMyStore(): Promise<StoreProfile | null> {
  return useMocks ? mockGetMyStore() : apiGetMyStore();
}

export async function requestVerification(): Promise<StoreProfile> {
  return useMocks ? mockRequestVerification() : apiRequestVerification();
}

export async function getStore(id: string): Promise<StoreProfile> {
  return useMocks ? mockGetStore(id) : apiGetStore(id);
}

export async function getStoreProducts(
  id: string,
  params: StoreProductsParams = {},
): Promise<Paginated<Product>> {
  return useMocks ? mockGetStoreProducts(id, params) : apiGetStoreProducts(id, params);
}
