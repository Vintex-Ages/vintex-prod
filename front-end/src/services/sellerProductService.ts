import { me } from '@/services/authService';
import { httpClient } from '@/services/httpClient';
import { getMyStore } from '@/services/storeService';
import type {
  ListingCorrection,
  Paginated,
  ProductInput,
  ProductStatus,
  SalesSummary,
  SellerProduct,
  SellerProductDetail,
} from '@/types/product';
import { netValue } from '@/utils/commission';

/**
 * Service de peças do vendedor (FE-SVC-seller-products, issue #202) —
 * rascunho, edição, publicar/republicar, despublicar, minhas peças por status
 * (RN-51) e resumo financeiro (RN-51.1). Mesmo padrão de `catalogService.ts` e
 * `storeService.ts`: flag `VITE_USE_MOCKS`, branch mock vs. API real, erros
 * normalizados em `SellerProductError`.
 *
 * O `ProductInput` (em `@/types/product`) é o CONTRATO PROVISÓRIO RN-92 — os
 * campos a confirmar estão marcados lá.
 *
 * Onde o back ainda diverge do combinado (publish só de rascunho, PATCH só de
 * ativo — ver tabela da #202), o mock segue o combinado; divergência vira
 * ajuste aqui, nunca na tela.
 */
const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

/** Mesmo default do back (`app/core/pagination.py`, BE-kit-api). */
const DEFAULT_PAGE_SIZE = 20;

export type SalesPeriod = SalesSummary['period'];

interface GetMineParams {
  status?: ProductStatus;
  page?: number;
  pageSize?: number;
}

/**
 * Erro de peça do vendedor com o mesmo `code` do envelope do back
 * (`app/core/errors.py::ErrorCode`) — quem chama o service trata o mesmo
 * formato de erro estando no mock ou na API real. `NO_IMAGE` é o único código
 * só do front: o back devolve 422 `VALIDATION_ERROR` com `fields.images`.
 */
export class SellerProductError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SellerProductError';
  }
}

function productNotFound(id: string): SellerProductError {
  return new SellerProductError('PRODUCT_NOT_FOUND', `Peça ${id} não encontrada.`);
}

function productSold(): SellerProductError {
  return new SellerProductError('PRODUCT_SOLD', 'Peça vendida não pode ser alterada.');
}

function noImage(): SellerProductError {
  return new SellerProductError('NO_IMAGE', 'Adicione ao menos uma foto antes de publicar.');
}

/**
 * Código só do front: a operação depende de rota que o back ainda não tem
 * (`docs/adr/0002`). A tela mostra "ainda não disponível", sem "Tentar de
 * novo" — tentar de novo não muda nada até o back entregar.
 */
export const NOT_AVAILABLE_YET = 'NOT_AVAILABLE_YET';

function notAvailableYet(message: string): SellerProductError {
  return new SellerProductError(NOT_AVAILABLE_YET, message);
}

/**
 * Rota que não existe no back: o envelope dele responde 405
 * `METHOD_NOT_ALLOWED` quando o caminho existe com outro método (o `PATCH`
 * de `/users/me/products/{id}`) e 404 `NOT_FOUND` genérico quando o caminho
 * não existe — nunca o `PRODUCT_NOT_FOUND` de peça inexistente.
 */
function isMissingRoute(error: SellerProductError): boolean {
  return error.code === 'METHOD_NOT_ALLOWED' || error.code === 'NOT_FOUND';
}

function productNotEditable(message: string): SellerProductError {
  return new SellerProductError('PRODUCT_NOT_EDITABLE', message);
}

/**
 * Mesmo código que o back devolve pra `POST /users/me/products` sem `name` ou
 * `price`: os dois são obrigatórios em `ProductDraftCreate` (back-end#159), e o
 * `RequestValidationError` do FastAPI vira 422 `VALIDATION_ERROR` com `fields`
 * (`app/core/errors.py::_validation_handler`, `develop`).
 */
function missingRequiredFields(): SellerProductError {
  return new SellerProductError('VALIDATION_ERROR', 'Nome e preço são obrigatórios.');
}

function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

/** Reais com 2 casas, igual `decimal(10,2)` do back — evita `0.1 + 0.2` virar dinheiro. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toSellerProduct(detail: SellerProductDetail): SellerProduct {
  const { id, name, price, status, description, category, size, color, brand, condition, style } =
    detail;
  return { id, name, price, status, description, category, size, color, brand, condition, style };
}

// ---- mock ----

/**
 * Peças de cada usuário do mock de auth em `sellerProductsKey(userId)`, no
 * mesmo padrão por usuário da loja (`store:${userId}`) e do carrinho. Na
 * primeira leitura o usuário ganha 4 peças de exemplo, uma de cada status.
 */
function sellerProductsKey(userId: string): string {
  return `seller-products:${userId}`;
}

type MockStore = SellerProductDetail['store'];

/** Loja usada quando o usuário do mock ainda não criou a dele (a rota real exige `RequireStore`). */
const FALLBACK_MOCK_STORE: MockStore = { id: 'store-mock', name: 'Minha loja', city: null };

function seedProducts(store: MockStore): SellerProductDetail[] {
  const base = { store, quantity: 1 as const, aiCorrections: [] };
  return [
    {
      ...base,
      id: 'seller-mock-1',
      name: 'Vestido Midi Floral',
      description: 'Vestido de viscose com estampa floral, pouco usado.',
      category: 'Roupas',
      size: 'M',
      color: 'Verde',
      brand: 'Farm',
      condition: 'Seminovo',
      price: 149.9,
      images: [],
      status: 'rascunho',
    },
    {
      ...base,
      id: 'seller-mock-2',
      name: 'Jaqueta Jeans Oversized',
      category: 'Roupas',
      size: 'G',
      color: 'Azul',
      brand: "Levi's",
      condition: 'Usado',
      price: 199.9,
      images: ['https://picsum.photos/seed/vintex-seller-2/600/800'],
      status: 'ativo',
    },
    {
      ...base,
      id: 'seller-mock-3',
      name: 'Bolsa de Couro Caramelo',
      category: 'Acessórios',
      color: 'Caramelo',
      condition: 'Usado',
      price: 120,
      images: ['https://picsum.photos/seed/vintex-seller-3/600/800'],
      status: 'vendido',
    },
    {
      ...base,
      id: 'seller-mock-4',
      name: 'Camisa Xadrez Flanela',
      category: 'Roupas',
      size: 'P',
      color: 'Vermelho',
      condition: 'Seminovo',
      price: 89.9,
      images: ['https://picsum.photos/seed/vintex-seller-4/600/800'],
      status: 'despublicado',
    },
  ];
}

async function currentMockStore(): Promise<MockStore> {
  const store = await getMyStore();
  return store ? { id: store.id, name: store.name, city: store.city } : FALLBACK_MOCK_STORE;
}

async function readProducts(userId: string): Promise<SellerProductDetail[]> {
  try {
    const raw = window.sessionStorage.getItem(sellerProductsKey(userId));
    if (raw) {
      return JSON.parse(raw) as SellerProductDetail[];
    }
  } catch {
    // Storage indisponível ou corrompido: cai no seed abaixo.
  }
  const seeded = seedProducts(await currentMockStore());
  writeProducts(userId, seeded);
  return seeded;
}

function writeProducts(userId: string, products: SellerProductDetail[]): void {
  try {
    window.sessionStorage.setItem(sellerProductsKey(userId), JSON.stringify(products));
  } catch {
    // Sem storage disponível: peças mockadas não são persistidas.
  }
}

let mockIdSeq = 0;

/** `mockIdSeq` volta a 0 num reload, mas as peças continuam no `sessionStorage`. */
function nextMockId(products: SellerProductDetail[]): string {
  let id: string;
  do {
    mockIdSeq += 1;
    id = `seller-draft-${mockIdSeq}`;
  } while (products.some((product) => product.id === id));
  return id;
}

/** Lê a peça do usuário logado e devolve o que a operação precisa pra gravar de volta. */
async function loadOwned(id: string) {
  const user = await me();
  const products = await readProducts(user.id);
  const index = products.findIndex((product) => product.id === id);
  if (index === -1) {
    throw productNotFound(id);
  }
  const save = (next: SellerProductDetail): SellerProductDetail => {
    const updated = [...products];
    updated[index] = next;
    writeProducts(user.id, updated);
    return next;
  };
  return { product: products[index], save };
}

/** Só aplica o que foi enviado, igual o `exclude_unset` do PATCH no back. */
function applyInput(
  product: SellerProductDetail,
  input: Partial<ProductInput>,
): SellerProductDetail {
  const defined = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<ProductInput>;
  return { ...product, ...defined, quantity: 1 };
}

async function mockCreateDraft(
  input: Partial<ProductInput>,
  corrections: ListingCorrection[],
): Promise<SellerProductDetail> {
  if (!input.name || input.price === undefined) {
    throw missingRequiredFields();
  }
  const user = await me();
  const products = await readProducts(user.id);
  const draft = applyInput(
    {
      id: nextMockId(products),
      name: input.name,
      price: input.price,
      images: [],
      quantity: 1,
      status: 'rascunho',
      store: await currentMockStore(),
      aiCorrections: corrections,
    },
    input,
  );
  writeProducts(user.id, [...products, draft]);
  return draft;
}

async function mockGetById(id: string): Promise<SellerProductDetail> {
  const { product } = await loadOwned(id);
  return product;
}

/** O back acumula `ai_corrections` a cada update; o mock faz o mesmo. */
async function mockUpdate(
  id: string,
  input: Partial<ProductInput>,
  corrections: ListingCorrection[],
): Promise<SellerProductDetail> {
  const { product, save } = await loadOwned(id);
  if (product.status === 'vendido') {
    throw productSold();
  }
  const updated = applyInput(product, input);
  return save({ ...updated, aiCorrections: [...product.aiCorrections, ...corrections] });
}

/** Publicar rascunho e republicar despublicado são a mesma transição (combinado na #202). */
async function mockPublish(id: string): Promise<SellerProductDetail> {
  const { product, save } = await loadOwned(id);
  if (product.status === 'vendido') {
    throw productSold();
  }
  if (product.images.length === 0) {
    throw noImage();
  }
  return save({ ...product, status: 'ativo' });
}

/** A peça despublicada continua em `getMine` (RN-52). */
async function mockUnpublish(id: string): Promise<SellerProductDetail> {
  const { product, save } = await loadOwned(id);
  if (product.status === 'vendido') {
    throw productSold();
  }
  if (product.status === 'rascunho') {
    throw productNotEditable('Rascunho ainda não foi publicado.');
  }
  return save({ ...product, status: 'despublicado' });
}

async function mockGetMine({
  status,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: GetMineParams): Promise<Paginated<SellerProduct>> {
  const user = await me();
  const products = await readProducts(user.id);
  const filtered = status ? products.filter((product) => product.status === status) : products;
  return paginate(filtered.map(toSellerProduct), page, pageSize);
}

/**
 * O mock não guarda data de venda, então soma todas as vendidas em qualquer
 * `period` — o recorte por período só existe na API real (back-end#146).
 */
async function mockGetSalesSummary(period: SalesPeriod): Promise<SalesSummary> {
  const user = await me();
  const sold = (await readProducts(user.id)).filter((product) => product.status === 'vendido');
  const gross = roundMoney(sold.reduce((total, product) => total + product.price, 0));
  // Regra dos 9% (RN-11) vem de `utils/commission.ts`, a única implementação.
  const net = netValue(gross);
  return { period, soldCount: sold.length, gross, commission: roundMoney(gross - net), net };
}

/** ObjectURLs no lugar das URLs remotas que a rota de upload vai devolver. */
function mockUploadMedia(files: File[]): string[] {
  return files.map((file) => URL.createObjectURL(file));
}

// ---- API real ----
// Rotas e schemas lidos dos PRs `back-end#157` e `back-end#159` (ver tabela
// "API real" da #202). Prefixo `/users/me/products` (ADR 0001 §4), mesmo que
// alguns endpoints ainda estejam em `/products/{id}` nos PRs — o combinado é
// mover. `getById` usa a rota declarada na back-end#234, que o back ainda
// não entregou (ver `apiGetById`).

interface ApiCorrection {
  field: string;
  suggested: string | null;
  final: string;
}

/** `ProductManagementResponse` (back-end#157): item da listagem, sem `images`/`store`. */
interface ApiSellerProduct {
  id: number | string;
  name: string;
  description: string | null;
  category: string | null;
  style: string | null;
  brand: string | null;
  color: string | null;
  size: string | null;
  condition: string | null;
  /** `Decimal` do Pydantic v2 chega como string (`"129.90"`) — a confirmar. */
  price: number | string;
  quantity: number;
  status: ProductStatus;
}

/** `ProductDraftResponse` (back-end#159). */
interface ApiSellerProductDetail extends ApiSellerProduct {
  store: { id: number | string; name: string; city: string | null };
  images: string[];
  ai_corrections: ApiCorrection[];
}

interface ApiPage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

interface ApiSalesSummary {
  period: SalesPeriod;
  sold_count: number;
  gross: number | string;
  commission: number | string;
  net: number | string;
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
}

/** `null` do back vira campo ausente, que é como o `ProductInput` modela opcional. */
function optional(value: string | null): string | undefined {
  return value ?? undefined;
}

function mapSellerProduct(item: ApiSellerProduct): SellerProduct {
  return {
    id: String(item.id),
    name: item.name,
    price: Number(item.price),
    status: item.status,
    description: optional(item.description),
    category: optional(item.category),
    size: optional(item.size),
    color: optional(item.color),
    brand: optional(item.brand),
    condition: optional(item.condition),
    style: optional(item.style),
  };
}

function mapSellerProductDetail(item: ApiSellerProductDetail): SellerProductDetail {
  return {
    ...mapSellerProduct(item),
    images: item.images,
    quantity: 1,
    store: { id: String(item.store.id), name: item.store.name, city: item.store.city },
    aiCorrections: item.ai_corrections.map((correction) => ({
      field: correction.field as keyof ProductInput,
      suggested: correction.suggested,
      final: correction.final,
    })),
  };
}

/** `quantity` não vai: o back fixa em 1 e nem recebe o campo (RN-46). */
function toApiBody(input: Partial<ProductInput>, corrections: ListingCorrection[]) {
  const fields: Partial<ProductInput> = { ...input };
  delete fields.quantity;
  return { ...fields, ai_corrections: corrections };
}

/**
 * Normaliza erro do axios pro mesmo `SellerProductError` do caminho mock. O
 * back manda "sem imagem" como 422 `VALIDATION_ERROR` com `fields.images`, e
 * aqui isso vira `NO_IMAGE`.
 */
function toSellerProductError(error: unknown): SellerProductError {
  const data = (error as { response?: { data?: ApiErrorEnvelope } }).response?.data;
  if (data?.error?.fields?.images) {
    return noImage();
  }
  if (data?.error?.code) {
    return new SellerProductError(data.error.code, data.error.message ?? 'Erro ao salvar peça.');
  }
  return new SellerProductError('INTERNAL_ERROR', 'Erro ao salvar peça.');
}

async function apiCreateDraft(
  input: Partial<ProductInput>,
  corrections: ListingCorrection[],
): Promise<SellerProductDetail> {
  try {
    const { data } = await httpClient.post<ApiSellerProductDetail>(
      '/users/me/products',
      toApiBody(input, corrections),
    );
    return mapSellerProductDetail(data);
  } catch (error) {
    throw toSellerProductError(error);
  }
}

async function apiUpdate(
  id: string,
  input: Partial<ProductInput>,
  corrections: ListingCorrection[],
): Promise<SellerProductDetail> {
  try {
    const { data } = await httpClient.patch<ApiSellerProductDetail>(
      `/users/me/products/${id}`,
      toApiBody(input, corrections),
    );
    return mapSellerProductDetail(data);
  } catch (error) {
    throw toSellerProductError(error);
  }
}

/**
 * Contrato: `publish`, `unpublish` e `update` devolvem `ProductDraftResponse`
 * (com `images`, `store` e `ai_corrections`). Alinhado no back pela
 * back-end#230 (29/09): `publish` aceita `rascunho` e `despublicado`, e a rota
 * `republish` deixou de existir.
 */
async function apiTransition(
  id: string,
  action: 'publish' | 'unpublish',
): Promise<SellerProductDetail> {
  try {
    const { data } = await httpClient.post<ApiSellerProductDetail>(
      `/users/me/products/${id}/${action}`,
    );
    return mapSellerProductDetail(data);
  } catch (error) {
    throw toSellerProductError(error);
  }
}

/** `ProductDetailResponse` do detalhe público: vazio chega como `""`, não `null`. */
interface ApiPublicProductDetail {
  id: number | string;
  name: string;
  description: string;
  category: string;
  style: string;
  brand: string;
  color: string;
  size: string;
  condition: string;
  price: number | string;
  status: ProductStatus;
  city: string;
  media: { url: string; position: number }[];
  store: { id: number | string; name: string };
}

function blankToUndefined(value: string): string | undefined {
  return value === '' ? undefined : value;
}

function mapPublicDetail(item: ApiPublicProductDetail): SellerProductDetail {
  return {
    id: String(item.id),
    name: item.name,
    price: Number(item.price),
    status: item.status,
    description: blankToUndefined(item.description),
    category: blankToUndefined(item.category),
    size: blankToUndefined(item.size),
    color: blankToUndefined(item.color),
    brand: blankToUndefined(item.brand),
    condition: blankToUndefined(item.condition),
    style: blankToUndefined(item.style),
    images: [...item.media].sort((a, b) => a.position - b.position).map((media) => media.url),
    quantity: 1,
    store: { id: String(item.store.id), name: item.store.name, city: item.city || null },
    // O back acumula as correções no `PATCH`; o formulário só manda as novas.
    aiCorrections: [],
  };
}

/**
 * Fallback provisório (`docs/adr/0002`, #297) até a back-end#234: o detalhe
 * público traz todos os campos do formulário, mas responde
 * `PRODUCT_NOT_FOUND` para peça `despublicado`.
 */
async function apiGetPublicDetail(id: string): Promise<SellerProductDetail> {
  try {
    const { data } = await httpClient.get<ApiPublicProductDetail>(`/products/${id}`);
    return mapPublicDetail(data);
  } catch (error) {
    const normalized = toSellerProductError(error);
    if (normalized.code === 'PRODUCT_NOT_FOUND') {
      throw notAvailableYet(
        'Editar peça pausada ainda não está disponível. Republique a peça para editá-la.',
      );
    }
    throw normalized;
  }
}

/**
 * `GET /users/me/products/{id}` — pedida na #202 e registrada como
 * back-end#234; ainda não existe na `develop` do back (29/09). O contrato
 * esperado é o mesmo `ProductDraftResponse` das transições, em qualquer
 * status. Enquanto a rota não chega, cai no detalhe público
 * (`docs/adr/0002`); remover o fallback quando a #234 entrar.
 */
async function apiGetById(id: string): Promise<SellerProductDetail> {
  try {
    const { data } = await httpClient.get<ApiSellerProductDetail>(`/users/me/products/${id}`);
    return mapSellerProductDetail(data);
  } catch (error) {
    const normalized = toSellerProductError(error);
    if (isMissingRoute(normalized)) return apiGetPublicDetail(id);
    throw normalized;
  }
}

async function apiGetMine({
  status,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
}: GetMineParams): Promise<Paginated<SellerProduct>> {
  try {
    const { data } = await httpClient.get<ApiPage<ApiSellerProduct>>('/users/me/products', {
      params: { status, page, page_size: pageSize },
    });
    return {
      items: data.items.map(mapSellerProduct),
      page: data.page,
      pageSize: data.page_size,
      total: data.total,
    };
  } catch (error) {
    throw toSellerProductError(error);
  }
}

/**
 * Rota proposta na #202; a back-end#146 ainda não tem branch. Sem a rota, a
 * tela mostra "ainda não disponível" em vez de erro (`docs/adr/0002`).
 */
async function apiGetSalesSummary(period: SalesPeriod): Promise<SalesSummary> {
  try {
    const { data } = await httpClient.get<ApiSalesSummary>('/users/me/sales/summary', {
      params: { period },
    });
    return {
      period: data.period,
      soldCount: data.sold_count,
      gross: Number(data.gross),
      commission: Number(data.commission),
      net: Number(data.net),
    };
  } catch (error) {
    const normalized = toSellerProductError(error);
    if (isMissingRoute(normalized)) {
      throw notAvailableYet('O resumo financeiro ainda não está disponível.');
    }
    throw normalized;
  }
}

// ---- API pública do service ----

export async function createDraft(
  input: Partial<ProductInput>,
  corrections: ListingCorrection[] = [],
): Promise<SellerProductDetail> {
  return useMocks ? mockCreateDraft(input, corrections) : apiCreateDraft(input, corrections);
}

/**
 * Peça do vendedor em qualquer status, pro formulário de edição (#216/#221) —
 * o detalhe público não serve: responde 404 pra `despublicado` e não traz
 * rascunho. A rota real é a back-end#234 (ver `apiGetById`).
 */
export async function getById(id: string): Promise<SellerProductDetail> {
  return useMocks ? mockGetById(id) : apiGetById(id);
}

export async function update(
  id: string,
  input: Partial<ProductInput>,
  corrections: ListingCorrection[] = [],
): Promise<SellerProductDetail> {
  return useMocks ? mockUpdate(id, input, corrections) : apiUpdate(id, input, corrections);
}

/** `rascunho` ou `despublicado` → `ativo`. Também é o "republicar" (não existe `republish`). */
export async function publish(id: string): Promise<SellerProductDetail> {
  return useMocks ? mockPublish(id) : apiTransition(id, 'publish');
}

export async function unpublish(id: string): Promise<SellerProductDetail> {
  return useMocks ? mockUnpublish(id) : apiTransition(id, 'unpublish');
}

export async function getMine(params: GetMineParams = {}): Promise<Paginated<SellerProduct>> {
  return useMocks ? mockGetMine(params) : apiGetMine(params);
}

export async function getSalesSummary(period: SalesPeriod): Promise<SalesSummary> {
  return useMocks ? mockGetSalesSummary(period) : apiGetSalesSummary(period);
}

interface ApiMediaItem {
  key: string;
  url: string;
  content_type: string;
  size: number;
}

/**
 * `POST /api/users/me/media` (back-end#73). A URL que volta é absoluta e
 * aponta para a própria API, porque quem baixa a foto depois é o servidor,
 * ao gerar a sugestão do anúncio: URL relativa ou `blob:` do navegador não
 * serve para ele.
 */
async function apiUploadMedia(files: File[]): Promise<string[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  formData.append('kind', 'photo');

  try {
    const { data } = await httpClient.post<{ items: ApiMediaItem[] }>('/users/me/media', formData);
    return data.items.map((item) => item.url);
  } catch (error) {
    throw toSellerProductError(error);
  }
}

/** Envia as fotos e devolve as URLs, na mesma ordem dos arquivos. */
export async function uploadMedia(files: File[]): Promise<string[]> {
  return useMocks ? mockUploadMedia(files) : apiUploadMedia(files);
}
