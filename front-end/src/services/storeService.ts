import { markCurrentAccountAsSeller, me } from '@/services/authService';
import { httpClient } from '@/services/httpClient';
import { products as mockProducts } from '@/mocks/products';
import type { Paginated, Product, Store } from '@/types/product';
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

/**
 * Armazenamento mock em duas partes, pra separar o perfil público do dono:
 * - `STORES_STORAGE_KEY`: todas as lojas criadas no mock, indexadas pelo id da
 *   loja — é o que `getStore(id)` consulta, sem depender de quem está logado.
 * - `storeOwnerKey(userId)`: id da loja de cada usuário do mock de auth, no
 *   mesmo padrão por usuário do carrinho (`cart:${userId}`). Uma chave fixa
 *   fazia o usuário B ver a loja do A depois de um logout (revisão do PR #243,
 *   ponto 3).
 */
const STORES_STORAGE_KEY = 'vintex.stores';

function storeOwnerKey(userId: string): string {
  return `store:${userId}`;
}

function readStores(): Record<string, StoreProfile> {
  try {
    const raw = window.sessionStorage.getItem(STORES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoreProfile>) : {};
  } catch {
    return {};
  }
}

function writeStores(stores: Record<string, StoreProfile>): void {
  try {
    window.sessionStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(stores));
  } catch {
    // Sem storage disponível: loja mockada não é persistida.
  }
}

function saveStore(store: StoreProfile): void {
  writeStores({ ...readStores(), [store.id]: store });
}

function readOwnedStore(userId: string): StoreProfile | null {
  try {
    const storeId = window.sessionStorage.getItem(storeOwnerKey(userId));
    return storeId ? (readStores()[storeId] ?? null) : null;
  } catch {
    return null;
  }
}

function writeStoreOwner(userId: string, storeId: string): void {
  try {
    window.sessionStorage.setItem(storeOwnerKey(userId), storeId);
  } catch {
    // Sem storage disponível: loja mockada não é persistida.
  }
}

/**
 * Versão do contrato de venda aceita ao criar a loja (#203). Fica fora do
 * `StoreProfile` porque o perfil não expõe esse campo — é só registro do aceite.
 */
function storeContractKey(storeId: string): string {
  return `store-contract:${storeId}`;
}

function writeAcceptedContractVersion(storeId: string, version: string): void {
  try {
    window.sessionStorage.setItem(storeContractKey(storeId), version);
  } catch {
    // Sem storage disponível: aceite mockado não é persistido.
  }
}

/**
 * Versão do contrato que a loja aceitou, no mock. Existe pra os testes
 * conferirem o registro do aceite — fora do mock quem registra é o back.
 */
export function getMockAcceptedContractVersion(storeId: string): string | undefined {
  try {
    return window.sessionStorage.getItem(storeContractKey(storeId)) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Tempo que o mock leva pra "aprovar" a verificação — dá à tela (FE-US007-1)
 * um estado intermediário real pra exibir enquanto a promise não resolve.
 */
const MOCK_VERIFICATION_DELAY_MS = 500;

/** Loja recém-criada não tem histórico: contadores zerados e, pela RN-74, sem `rating`/taxa. */
const EMPTY_STORE_METRICS: StoreMetrics = {
  activeProducts: 0,
  soldProducts: 0,
  monthsOnPlatform: 0,
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockIdSeq = 0;

/**
 * `mockIdSeq` volta a 0 num reload, mas as lojas continuam no
 * `sessionStorage` — pula ids já usados pra não sobrescrever a loja de outro
 * usuário.
 */
function nextMockId(): string {
  const stores = readStores();
  let id: string;
  do {
    mockIdSeq += 1;
    id = `store-mock-${mockIdSeq}`;
  } while (id in stores);
  return id;
}

async function mockCreateStore(input: StoreInput): Promise<StoreProfile> {
  const user = await me();
  const store: StoreProfile = {
    id: nextMockId(),
    name: input.name,
    description: input.description,
    logoUrl: null,
    city: input.address.city,
    state: input.address.state,
    verification: 'pendente',
    createdAt: new Date().toISOString(),
    metrics: EMPTY_STORE_METRICS,
  };
  saveStore(store);
  writeStoreOwner(user.id, store.id);
  if (input.acceptedContractVersion) {
    writeAcceptedContractVersion(store.id, input.acceptedContractVersion);
  }
  return store;
}

async function mockGetMyStore(): Promise<StoreProfile | null> {
  const user = await me();
  return readOwnedStore(user.id);
}

async function mockRequestVerification(): Promise<StoreProfile> {
  const user = await me();
  const store = readOwnedStore(user.id);
  if (!store) {
    throw storeNotCreated();
  }
  // Grava só depois do delay: nesse meio-tempo `getMyStore` ainda devolve 'pendente'.
  await wait(MOCK_VERIFICATION_DELAY_MS);
  const verified: StoreProfile = { ...store, verification: 'confiavel' };
  saveStore(verified);
  return verified;
}

/**
 * Perfil público: não exige login. Procura primeiro nas lojas criadas no mock
 * (de qualquer usuário); sem nenhuma com esse `id`, procura em
 * `mocks/products.ts` um produto cujo `store.id` bata — o perfil é montado a
 * partir do `Store` embutido no produto, já que o mock de catálogo não tem uma
 * lista de lojas separada.
 */
function mockGetStore(id: string): StoreProfile {
  const created = readStores()[id];
  if (created) {
    return created;
  }

  const product = mockProducts.find((item) => item.store.id === id);
  if (!product) {
    throw storeNotFound(id);
  }

  const { store } = product;
  // `activeProducts` vem do próprio mock pra bater com `getStoreProducts`; o
  // resto é fictício, só pra página da loja (FE-US007-2) ter o que mostrar.
  const activeProducts = mockProducts.filter(
    (item) => item.store.id === id && item.status === 'ativo',
  ).length;
  return {
    id: store.id,
    name: store.name,
    description: 'Brechó com curadoria de peças únicas.',
    logoUrl: store.logoUrl ?? null,
    city: store.city ?? '',
    state: 'RS',
    verification: store.verified ? 'confiavel' : 'pendente',
    createdAt: '2024-01-01T00:00:00.000Z',
    metrics: {
      activeProducts,
      soldProducts: 37,
      monthsOnPlatform: 18,
      shippingWithoutComplaintRate: 0.96,
      rating: 4.8,
    },
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
// Endpoints alinhados na revisão do PR #243 (comentário do Mauro): seguem a
// convenção do backend (`.ai/adr/0001-fundacao-http-kit-api.md`, §4, no repo
// do back) de que `/api/auth/*` é só para credencial e `/api/users/me/*` é
// usado para todo recurso do usuário logado — mesmo formato que
// `/users/me/preferences` (`preferenceService.ts`) já usa. Por isso a loja do
// próprio vendedor vive em `/users/me/store` (criar, ler, verificar), nunca em
// `/stores/me` — evita a armadilha de `/stores/me` colidir com `/stores/{id}`
// por ordem de resolução de rota (se `{id}` for tratado como inteiro, "me" dá
// 422; se for texto, "me" vira um id como outro qualquer).
// `GET /stores/{id}` e `GET /stores/{id}/products` continuam como estavam —
// são leitura pública, não mudam.
// `POST /users/me/store` vai como multipart quando há `logo`, JSON caso
// contrário.
// `accepted_contract_version` (FE-SVC-legal, #203) é proposta do front, ainda
// não confirmada com o back (back-end#29, #30): confirmar nome e onde o back
// grava (`Seller.terms_version`?) antes de ligar via API real.

/**
 * Contrato real de `GET /api/stores/{id}` (`StoreDetailResponse`, back-end#142),
 * conferido contra o schema antes do merge daquele PR. Diverge em tudo do que
 * o front supunha: `city`/`state` vêm dentro de `address`, o selo vem como
 * `verified: boolean` em vez do estado, a data de abertura está dentro de
 * `metrics`, e as contagens têm outro nome. A conversão é toda aqui, porque é
 * o service que fala com a rede.
 */
interface ApiStoreAddress {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  zip_code: string;
}

interface ApiStoreMetrics {
  created_at: string;
  products_listed: number;
  products_sold: number;
}

interface ApiStoreProfile {
  id: number | string;
  name: string;
  description: string | null;
  logo_url: string | null;
  verified: boolean;
  address: ApiStoreAddress | null;
  metrics: ApiStoreMetrics;
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

/** Meses completos entre a abertura da loja e hoje (RN-74). */
function mesesNaPlataforma(createdAt: string): number {
  const abertura = new Date(createdAt);
  if (Number.isNaN(abertura.getTime())) return 0;

  const hoje = new Date();
  const meses =
    (hoje.getFullYear() - abertura.getFullYear()) * 12 +
    (hoje.getMonth() - abertura.getMonth()) -
    (hoje.getDate() < abertura.getDate() ? 1 : 0);

  return Math.max(0, meses);
}

/**
 * `shippingWithoutComplaintRate` e `rating` seguem ausentes: o back diz na
 * própria docstring que só entrega o que já existe, e a tela mostra "em breve"
 * para o resto.
 */
function mapStoreMetrics(metrics: ApiStoreMetrics): StoreMetrics {
  return {
    activeProducts: metrics.products_listed,
    soldProducts: metrics.products_sold,
    monthsOnPlatform: mesesNaPlataforma(metrics.created_at),
  };
}

function mapStoreProfile(store: ApiStoreProfile): StoreProfile {
  return {
    id: String(store.id),
    name: store.name,
    description: store.description ?? '',
    logoUrl: store.logo_url,
    // Loja sem endereço cadastrado ainda é loja: a tela esconde a linha em vez
    // de quebrar. O back permite `address` nulo.
    city: store.address?.city ?? '',
    state: store.address?.state ?? '',
    verification: store.verified ? 'confiavel' : 'pendente',
    createdAt: store.metrics.created_at,
    metrics: mapStoreMetrics(store.metrics),
  };
}

/**
 * `GET /api/stores/{id}/products` devolve só a peça (`StoreProductItemResponse`):
 * a loja não se repete em cada item, porque é a mesma da rota. O mapeamento
 * anterior lia `item.store.id` e derrubava a página com `TypeError` assim que o
 * mock fosse desligado — a loja entra a partir do perfil já carregado.
 */
function mapStoreProductItem(item: ApiStoreProductItem, store: Store): Product {
  return {
    id: String(item.id),
    name: item.name,
    price: item.price,
    coverImageUrl: item.cover_image_url,
    store,
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
      ? await httpClient.post<ApiStoreProfile>('/users/me/store', toStoreFormData(input), {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      : await httpClient.post<ApiStoreProfile>('/users/me/store', {
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

/**
 * `GET /api/users/me/store` (back-end#141) devolve a loja **do ponto de vista
 * do dono** — `StoreResponse`, com documento e termos — e não o retrato
 * público de `GET /api/stores/{id}`. São dois formatos diferentes para a mesma
 * entidade, e por isso dois mapeadores.
 *
 * Usar o mapeador público aqui derrubava a tela com `TypeError`, porque ele lê
 * `metrics.created_at` e esta resposta não tem `metrics`. A guarda de vendedor
 * só precisa saber se a loja existe; cidade, selo e métricas continuam vindo
 * do retrato público, que é quem os tem.
 */
interface ApiMyStore {
  id: number | string;
  seller_id: number | string;
  name: string;
  description: string | null;
  logo_url: string | null;
  document_type: string;
  document_value: string;
  terms_version: string | null;
  terms_accepted_at: string | null;
}

function mapMyStore(store: ApiMyStore): StoreProfile {
  return {
    id: String(store.id),
    name: store.name,
    description: store.description ?? '',
    logoUrl: store.logo_url,
    // Não vêm nesta rota; quem precisa deles busca o retrato público.
    city: '',
    state: '',
    verification: 'pendente',
    createdAt: store.terms_accepted_at ?? '',
  };
}

async function apiGetMyStore(): Promise<StoreProfile | null> {
  try {
    const { data } = await httpClient.get<ApiMyStore>('/users/me/store');
    return mapMyStore(data);
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
    const { data } = await httpClient.post<ApiStoreProfile>('/users/me/store/verification');
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
    // A rota devolve só a peça, sem repetir a loja em cada item, o que está
    // certo — mas o `ProductCard` mostra o nome da loja, e sem ele cada card
    // fica com uma linha em branco. Buscar o perfil junto custa uma requisição
    // a mais numa tela que já carrega esse mesmo perfil; se virar problema, o
    // caminho é a página passar a loja que ela já tem.
    const [resposta, loja] = await Promise.all([
      httpClient.get<ApiPage<ApiStoreProductItem>>(`/stores/${id}/products`, {
        params: { page, page_size: pageSize },
      }),
      apiGetStore(id),
    ]);

    const { data } = resposta;
    const store: Store = { id: loja.id, name: loja.name, city: loja.city || undefined };

    return {
      items: data.items.map((item) => mapStoreProductItem(item, store)),
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
  if (!useMocks) {
    return apiCreateStore(input);
  }
  const store = await mockCreateStore(input);
  // Na API real o back marca `is_seller` ao criar a loja; no mock, quem faz
  // isso é o authService — senão `refreshUser()` nunca vê a conta como vendedora.
  await markCurrentAccountAsSeller();
  return store;
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
