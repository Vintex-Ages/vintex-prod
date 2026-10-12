import { httpClient } from '@/services/httpClient';
import { removeItem as removeCartItem } from '@/services/cartService';
import { products as mockProducts } from '@/mocks/products';
import type {
  DeliveryAddress,
  Order,
  OrderItem,
  OrderStatus,
  OrderSummary,
  PaymentStatus,
} from '@/types/order';
import type { Paginated } from '@/types/product';

/**
 * Service de Pedidos do comprador (FE-SVC-orders, issue #311).
 *
 * Um Pedido é sempre de **uma única loja** (`CONTEXT.md` §orders 1.11):
 * finalizar um carrinho com N lojas gera N Pedidos, um de cada vez.
 *
 * FLAG `VITE_USE_MOCKS` (mesmo padrão de `cartService`/`catalogService`):
 *   - ausente ou `'true'` → mock via `sessionStorage`, isolado por usuário;
 *   - `'false'` → API real via `httpClient`.
 *
 * `userId` em toda função (mesma convenção do `cartService`, revisão do PR
 * #228): o modo mock usa pra isolar pedidos no `sessionStorage`; o modo API
 * ignora — o back identifica o usuário pelo token em `/users/me/*`.
 *
 * API real (quando existir)
 *
 *   Os endpoints abaixo são proposta do front — o back ainda não tem nada
 *   disso na `develop` (verificado em 30/09). Confirmar nome, verbo e shape
 *   com o par de back-end antes de ligar a flag. Divergência vira ajuste
 *   aqui, nunca na tela.
 *
 *   `POST /users/me/orders` · `GET /users/me/orders` (Page[OrderSummary]) ·
 *   `GET /users/me/orders/{id}` (com `store.pix_key` e `history`) ·
 *   `POST /users/me/orders/{id}/receipt` (multipart).
 *
 * Usage:
 *   import { createOrder, listMyOrders, getOrder, submitReceipt } from '@/services/orderService';
 *
 *   const order = await createOrder(userId, { productIds, deliveryAddress });
 *   const { items } = await listMyOrders(userId);
 *   const detail = await getOrder(userId, order.id);
 *   await submitReceipt(userId, order.id, file);
 */

const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

const DEFAULT_PAGE_SIZE = 20;

/** RN-11. */
const PLATFORM_FEE_RATE = 0.09;

/**
 * Erro de Pedido com `code` tipado — o mesmo formato em mock e API real.
 * Códigos usados pelo mock: `EMPTY_ORDER`, `PIECE_UNAVAILABLE`,
 * `MIXED_STORES`, `STORE_WITHOUT_PIX`, `ORDER_NOT_FOUND`.
 */
export class OrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OrderError';
  }
}

/** Evita acúmulo de erro de ponto flutuante ao somar/calcular reais. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

function toSummary(order: Order): OrderSummary {
  const { id, store, items, totalAmount, status, payment, createdAt } = order;
  return { id, store, items, totalAmount, status, payment, createdAt };
}

// ---------------------------------------------------------------------------
// Modo MOCK — pedidos em sessionStorage, isolados por usuário.
// ---------------------------------------------------------------------------

/**
 * Chaves Pix por loja, só pro mock (`Store` não guarda essa chave — mesma
 * decisão do `cartService`: inventar aqui mascararia a dependência do back).
 * A loja `'3'` fica sem Pix de propósito, pra demonstrar `STORE_WITHOUT_PIX`
 * (loja criada antes do back-end#216, por hipótese do mock).
 */
const MOCK_STORE_PIX_KEYS: Record<string, string> = {
  '1': 'mercadopublico@vintex.com',
  '2': 'garimpodaredencao@vintex.com',
  '4': 'segundachance@vintex.com',
  '5': 'baudavonair@vintex.com',
  '6': 'desapegoserrano@vintex.com',
  '7': 'atelierreviver@vintex.com',
};

function orderStorageKey(userId: string): string {
  return `orders:${userId}`;
}

function readStoredOrders(userId: string): Order[] {
  const raw = window.sessionStorage.getItem(orderStorageKey(userId));
  return raw ? (JSON.parse(raw) as Order[]) : [];
}

function writeStoredOrders(userId: string, orders: Order[]): void {
  window.sessionStorage.setItem(orderStorageKey(userId), JSON.stringify(orders));
}

/**
 * Um Pedido de exemplo em cada um dos 6 status, mais um demonstrando
 * rejeição de comprovante (RN-23) — pra timeline/lista ficarem
 * demonstráveis sem precisar clicar o fluxo inteiro (RN-82, status
 * simulado). Dados estáticos, compartilhados entre usuários do mock — não
 * vivem no `sessionStorage` (ver doc do arquivo): só os Pedidos de verdade,
 * criados por `createOrder`, ficam isolados por usuário.
 */
function buildHistory(
  statuses: OrderStatus[],
  startedAt: string,
): { status: OrderStatus; at: string }[] {
  const start = new Date(startedAt).getTime();
  return statuses.map((status, index) => ({
    status,
    at: new Date(start + index * 86_400_000).toISOString(),
  }));
}

function exampleOrder(partial: {
  id: string;
  item: Pick<OrderItem, 'productId' | 'name' | 'price' | 'coverImageUrl'>;
  store: { id: string; name: string; pixKey: string | null };
  statuses: OrderStatus[];
  payment: Order['payment'];
}): Order {
  const createdAt = '2026-09-20T12:00:00.000Z';
  const history = buildHistory(partial.statuses, createdAt);
  const productAmount = roundMoney(partial.item.price);

  return {
    id: partial.id,
    store: partial.store,
    items: [partial.item],
    productAmount,
    platformFee: roundMoney(productAmount * PLATFORM_FEE_RATE),
    totalAmount: productAmount,
    status: partial.statuses[partial.statuses.length - 1],
    history,
    deliveryAddress: {
      cep: '90010-000',
      street: 'Rua dos Andradas',
      number: '500',
      district: 'Centro Histórico',
      city: 'Porto Alegre',
      state: 'RS',
    },
    payment: partial.payment,
    createdAt: history[0].at,
  };
}

const EXAMPLE_ORDERS: Order[] = [
  exampleOrder({
    id: 'example-aguardando-comprovante',
    item: { productId: '5', name: 'Calça jeans reta azul', price: 119.9, coverImageUrl: null },
    store: { id: '5', name: 'Baú da Vó Nair', pixKey: MOCK_STORE_PIX_KEYS['5'] },
    statuses: ['aguardando_comprovante'],
    payment: null,
  }),
  exampleOrder({
    id: 'example-em-analise',
    item: { productId: '6', name: 'Camisa social branca', price: 89.9, coverImageUrl: null },
    store: { id: '6', name: 'Desapego Serrano', pixKey: MOCK_STORE_PIX_KEYS['6'] },
    statuses: ['aguardando_comprovante', 'em_analise'],
    payment: {
      status: 'pendente',
      receiptName: 'comprovante-pix.jpg',
      submittedAt: '2026-09-21T09:00:00.000Z',
    },
  }),
  exampleOrder({
    id: 'example-confirmado',
    item: { productId: '7', name: 'Jaqueta bomber caramelo', price: 139.9, coverImageUrl: null },
    store: { id: '7', name: 'Ateliê Reviver', pixKey: MOCK_STORE_PIX_KEYS['7'] },
    statuses: ['aguardando_comprovante', 'em_analise', 'confirmado'],
    payment: {
      status: 'aprovado',
      receiptName: 'comprovante-pix.jpg',
      submittedAt: '2026-09-21T09:00:00.000Z',
    },
  }),
  exampleOrder({
    id: 'example-preparando',
    item: { productId: '8', name: 'Camiseta gráfica retrô', price: 69.9, coverImageUrl: null },
    store: { id: '1', name: 'Brechó Mercado Público', pixKey: MOCK_STORE_PIX_KEYS['1'] },
    statuses: ['aguardando_comprovante', 'em_analise', 'confirmado', 'preparando'],
    payment: { status: 'aprovado', receiptName: 'comprovante-pix.jpg' },
  }),
  exampleOrder({
    id: 'example-enviado',
    item: {
      productId: '1',
      name: 'Jaqueta jeans vintage clara',
      price: 159.9,
      coverImageUrl: null,
    },
    store: { id: '1', name: 'Brechó Mercado Público', pixKey: MOCK_STORE_PIX_KEYS['1'] },
    statuses: ['aguardando_comprovante', 'em_analise', 'confirmado', 'preparando', 'enviado'],
    payment: { status: 'aprovado', receiptName: 'comprovante-pix.jpg' },
  }),
  exampleOrder({
    id: 'example-concluido',
    item: { productId: '2', name: 'Blusa bordada off-white', price: 79.9, coverImageUrl: null },
    store: { id: '2', name: 'Garimpo da Redenção', pixKey: MOCK_STORE_PIX_KEYS['2'] },
    statuses: [
      'aguardando_comprovante',
      'em_analise',
      'confirmado',
      'preparando',
      'enviado',
      'concluido',
    ],
    payment: { status: 'aprovado', receiptName: 'comprovante-pix.jpg' },
  }),
  exampleOrder({
    id: 'example-comprovante-rejeitado',
    item: { productId: '3', name: 'Jaqueta biker preta', price: 229.9, coverImageUrl: null },
    // Loja '3' de propósito: é a mesma sem Pix no MOCK_STORE_PIX_KEYS, mas
    // aqui o exemplo já tem `pixKey: null` porque é só snapshot — o Pedido
    // de exemplo não passa pela validação de STORE_WITHOUT_PIX.
    store: { id: '3', name: 'Roupa Rodada', pixKey: null },
    statuses: ['aguardando_comprovante', 'em_analise', 'aguardando_comprovante'],
    payment: {
      status: 'rejeitado',
      receiptName: 'comprovante-ilegivel.jpg',
      submittedAt: '2026-09-21T09:00:00.000Z',
      rejectionReason: 'Comprovante ilegível — reenvie uma foto nítida do Pix.',
    },
  }),
];

async function mockCreateOrder(
  userId: string,
  input: { productIds: string[]; deliveryAddress: DeliveryAddress },
): Promise<Order> {
  if (input.productIds.length === 0) {
    throw new OrderError('EMPTY_ORDER', 'Selecione ao menos uma peça para fazer o Pedido.');
  }

  const products = input.productIds.map((id) => {
    const product = mockProducts.find((item) => item.id === id);
    if (!product) {
      throw new OrderError('PIECE_UNAVAILABLE', `Peça ${id} não encontrada.`);
    }
    if (product.status !== 'ativo') {
      throw new OrderError(
        'PIECE_UNAVAILABLE',
        `A peça "${product.name}" não está mais disponível.`,
      );
    }
    return product;
  });

  const storeIds = new Set(products.map((product) => product.store.id));
  if (storeIds.size > 1) {
    throw new OrderError('MIXED_STORES', 'Um Pedido só pode ter peças da mesma loja.');
  }

  const store = products[0].store;
  const pixKey = MOCK_STORE_PIX_KEYS[store.id] ?? null;
  if (!pixKey) {
    throw new OrderError(
      'STORE_WITHOUT_PIX',
      `A loja "${store.name}" ainda não cadastrou uma chave Pix.`,
    );
  }

  const items: OrderItem[] = products.map((product) => ({
    productId: product.id,
    name: product.name,
    price: product.price,
    coverImageUrl: product.coverImageUrl,
  }));

  const productAmount = roundMoney(items.reduce((sum, item) => sum + item.price, 0));
  const now = new Date().toISOString();

  const order: Order = {
    id: crypto.randomUUID(),
    store: { id: store.id, name: store.name, pixKey },
    items,
    productAmount,
    platformFee: roundMoney(productAmount * PLATFORM_FEE_RATE),
    totalAmount: productAmount,
    status: 'aguardando_comprovante',
    history: [{ status: 'aguardando_comprovante', at: now }],
    deliveryAddress: input.deliveryAddress,
    payment: null,
    createdAt: now,
  };

  // Peça é única (RN-46): marca vendida já na criação do Pedido (decisão
  // aceita no planejamento de 30/09 — "Pendências de contrato" no corpo da
  // issue). Mutação direta no array compartilhado de `mocks/products.ts`.
  for (const product of products) {
    product.status = 'vendido';
  }

  await Promise.all(input.productIds.map((productId) => removeCartItem(userId, productId)));

  writeStoredOrders(userId, [order, ...readStoredOrders(userId)]);
  return order;
}

function mockListMyOrders(userId: string, page: number): Paginated<OrderSummary> {
  const all = [...readStoredOrders(userId), ...EXAMPLE_ORDERS];
  return paginate(all.map(toSummary), page, DEFAULT_PAGE_SIZE);
}

function mockGetOrder(userId: string, id: string): Promise<Order> {
  const order =
    readStoredOrders(userId).find((item) => item.id === id) ??
    EXAMPLE_ORDERS.find((item) => item.id === id);

  return order
    ? Promise.resolve(order)
    : Promise.reject(new OrderError('ORDER_NOT_FOUND', `Pedido ${id} não encontrado.`));
}

async function mockSubmitReceipt(userId: string, orderId: string, file: File): Promise<Order> {
  const orders = readStoredOrders(userId);
  const index = orders.findIndex((order) => order.id === orderId);
  if (index === -1) {
    throw new OrderError('ORDER_NOT_FOUND', `Pedido ${orderId} não encontrado.`);
  }

  const now = new Date().toISOString();
  const updated: Order = {
    ...orders[index],
    status: 'em_analise',
    history: [...orders[index].history, { status: 'em_analise', at: now }],
    payment: { status: 'pendente', receiptName: file.name, submittedAt: now },
  };

  orders[index] = updated;
  writeStoredOrders(userId, orders);
  return updated;
}

/**
 * Sem mock de `users.address` disponível ainda: usa o endereço do Pedido
 * mais recente do usuário como padrão (comportamento razoável — a maioria
 * dos checkouts reaproveita o último endereço usado). Sem Pedido nenhum,
 * não tem o que pré-preencher.
 */
function mockGetDeliveryAddressDefault(userId: string): Promise<DeliveryAddress | null> {
  const [latest] = readStoredOrders(userId);
  return Promise.resolve(latest?.deliveryAddress ?? null);
}

/**
 * Mock-only: aprovar/rejeitar comprovante é ação de ADMIN, não do
 * comprador — não existe (nem deveria existir) um "modo API" aqui, porque
 * a API real de aprovação é um endpoint de admin próprio, fora do
 * `orderService` do comprador. Expostas para o mock do
 * `FE-SVC-admin-receipts` (#312) chamar.
 */
export function approveReceipt(userId: string, orderId: string): Promise<Order> {
  const orders = readStoredOrders(userId);
  const index = orders.findIndex((order) => order.id === orderId);
  if (index === -1) {
    return Promise.reject(new OrderError('ORDER_NOT_FOUND', `Pedido ${orderId} não encontrado.`));
  }

  const now = new Date().toISOString();
  const updated: Order = {
    ...orders[index],
    status: 'confirmado',
    history: [...orders[index].history, { status: 'confirmado', at: now }],
    payment: orders[index].payment
      ? { ...orders[index].payment, status: 'aprovado', rejectionReason: undefined }
      : { status: 'aprovado' },
  };

  orders[index] = updated;
  writeStoredOrders(userId, orders);
  return Promise.resolve(updated);
}

export function rejectReceipt(userId: string, orderId: string, reason: string): Promise<Order> {
  const orders = readStoredOrders(userId);
  const index = orders.findIndex((order) => order.id === orderId);
  if (index === -1) {
    return Promise.reject(new OrderError('ORDER_NOT_FOUND', `Pedido ${orderId} não encontrado.`));
  }

  const now = new Date().toISOString();
  const updated: Order = {
    ...orders[index],
    status: 'aguardando_comprovante',
    history: [...orders[index].history, { status: 'aguardando_comprovante', at: now }],
    payment: orders[index].payment
      ? { ...orders[index].payment, status: 'rejeitado', rejectionReason: reason }
      : { status: 'rejeitado', rejectionReason: reason },
  };

  orders[index] = updated;
  writeStoredOrders(userId, orders);
  return Promise.resolve(updated);
}

// ---------------------------------------------------------------------------
// Modo API REAL — proposta do front, não confirmada com o back (ver doc do
// arquivo). Dinheiro: `decimal(10,2)` do back pode serializar como string ou
// número — `toMoney` aceita os dois, igual aos services da S2.
// ---------------------------------------------------------------------------

function toMoney(value: string | number): number {
  return typeof value === 'string' ? Number(value) : value;
}

interface ApiOrderItem {
  product_id: number | string;
  name: string;
  price: number | string;
  cover_image_url: string | null;
}

interface ApiOrderStore {
  id: number | string;
  name: string;
  pix_key: string | null;
}

interface ApiDeliveryAddress {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
}

interface ApiOrderPayment {
  status: PaymentStatus;
  receipt_name?: string;
  submitted_at?: string;
  rejection_reason?: string;
}

interface ApiOrder {
  id: number | string;
  store: ApiOrderStore;
  items: ApiOrderItem[];
  product_amount: number | string;
  platform_fee: number | string;
  total_amount: number | string;
  status: OrderStatus;
  history: { status: OrderStatus; at: string }[];
  delivery_address: ApiDeliveryAddress;
  payment: ApiOrderPayment | null;
  created_at: string;
}

type ApiOrderSummary = Pick<
  ApiOrder,
  'id' | 'store' | 'items' | 'total_amount' | 'status' | 'payment' | 'created_at'
>;

interface ApiPage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

function mapApiDeliveryAddress(address: ApiDeliveryAddress): DeliveryAddress {
  return {
    cep: address.cep,
    street: address.street,
    number: address.number,
    complement: address.complement,
    district: address.district,
    city: address.city,
    state: address.state,
  };
}

function toApiDeliveryAddress(address: DeliveryAddress): ApiDeliveryAddress {
  return address;
}

function mapApiOrderItem(item: ApiOrderItem): OrderItem {
  return {
    productId: String(item.product_id),
    name: item.name,
    price: toMoney(item.price),
    coverImageUrl: item.cover_image_url,
  };
}

function mapApiPayment(payment: ApiOrderPayment | null): Order['payment'] {
  if (!payment) return null;
  return {
    status: payment.status,
    receiptName: payment.receipt_name,
    submittedAt: payment.submitted_at,
    rejectionReason: payment.rejection_reason,
  };
}

function mapApiOrder(data: ApiOrder): Order {
  return {
    id: String(data.id),
    store: {
      id: String(data.store.id),
      name: data.store.name,
      pixKey: data.store.pix_key,
    },
    items: data.items.map(mapApiOrderItem),
    productAmount: toMoney(data.product_amount),
    platformFee: toMoney(data.platform_fee),
    totalAmount: toMoney(data.total_amount),
    status: data.status,
    history: data.history,
    deliveryAddress: mapApiDeliveryAddress(data.delivery_address),
    payment: mapApiPayment(data.payment),
    createdAt: data.created_at,
  };
}

function mapApiOrderSummary(data: ApiOrderSummary): OrderSummary {
  return {
    id: String(data.id),
    store: {
      id: String(data.store.id),
      name: data.store.name,
      pixKey: data.store.pix_key,
    },
    items: data.items.map(mapApiOrderItem),
    totalAmount: toMoney(data.total_amount),
    status: data.status,
    payment: mapApiPayment(data.payment),
    createdAt: data.created_at,
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

function toOrderError(error: unknown): OrderError {
  const data = (error as { response?: { data?: { error?: { code?: string; message?: string } } } })
    .response?.data;
  if (data?.error?.code) {
    return new OrderError(data.error.code, data.error.message ?? 'Erro ao processar o Pedido.');
  }
  return new OrderError('INTERNAL_ERROR', 'Erro ao processar o Pedido.');
}

async function apiCreateOrder(input: {
  productIds: string[];
  deliveryAddress: DeliveryAddress;
}): Promise<Order> {
  try {
    const { data } = await httpClient.post<ApiOrder>('/users/me/orders', {
      product_ids: input.productIds,
      delivery_address: toApiDeliveryAddress(input.deliveryAddress),
    });
    return mapApiOrder(data);
  } catch (error) {
    throw toOrderError(error);
  }
}

async function apiListMyOrders(page: number): Promise<Paginated<OrderSummary>> {
  try {
    const { data } = await httpClient.get<ApiPage<ApiOrderSummary>>('/users/me/orders', {
      params: { page },
    });
    return mapPage(data, mapApiOrderSummary);
  } catch (error) {
    throw toOrderError(error);
  }
}

async function apiGetOrder(id: string): Promise<Order> {
  try {
    const { data } = await httpClient.get<ApiOrder>(`/users/me/orders/${id}`);
    return mapApiOrder(data);
  } catch (error) {
    throw toOrderError(error);
  }
}

async function apiSubmitReceipt(orderId: string, file: File): Promise<Order> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await httpClient.post<ApiOrder>(
      `/users/me/orders/${orderId}/receipt`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return mapApiOrder(data);
  } catch (error) {
    throw toOrderError(error);
  }
}

/**
 * TODO: endpoint/shape de `users.address` ainda não confirmado com o back
 * (a issue só diz "a partir de users.address", sem endpoint). Sem
 * contrato, não arrisca um `GET` que pode nem existir — devolve `null`
 * (sem pré-preenchimento) até confirmar.
 */
function apiGetDeliveryAddressDefault(): Promise<DeliveryAddress | null> {
  return Promise.resolve(null);
}

// ---------------------------------------------------------------------------
// Seleção do modo.
// ---------------------------------------------------------------------------

export function createOrder(
  userId: string,
  input: { productIds: string[]; deliveryAddress: DeliveryAddress },
): Promise<Order> {
  return useMocks ? mockCreateOrder(userId, input) : apiCreateOrder(input);
}

export function listMyOrders(userId: string, page = 1): Promise<Paginated<OrderSummary>> {
  return useMocks ? Promise.resolve(mockListMyOrders(userId, page)) : apiListMyOrders(page);
}

export function getOrder(userId: string, id: string): Promise<Order> {
  return useMocks ? mockGetOrder(userId, id) : apiGetOrder(id);
}

export function submitReceipt(userId: string, orderId: string, file: File): Promise<Order> {
  return useMocks ? mockSubmitReceipt(userId, orderId, file) : apiSubmitReceipt(orderId, file);
}

export function getDeliveryAddressDefault(userId: string): Promise<DeliveryAddress | null> {
  return useMocks ? mockGetDeliveryAddressDefault(userId) : apiGetDeliveryAddressDefault();
}
