import { httpClient } from '@/services/httpClient';
import {
  approveReceipt as approveOrderReceipt,
  rejectReceipt as rejectOrderReceipt,
} from '@/services/orderService';
import type { ListReceiptsParams, ReceiptReview } from '@/types/admin';
import type { Order, OrderItem, PaymentStatus } from '@/types/order';
import type { Paginated } from '@/types/product';

/**
 * Service da fila de comprovantes da administradora (FE-SVC-admin-receipts,
 * issue #312).
 *
 * FLAG `VITE_USE_MOCKS` (mesmo padrão de `orderService`/`cartService`):
 *   - ausente ou `'true'` → mock sobre o MESMO `sessionStorage` do
 *     `orderService`: aprovar/rejeitar aqui muda o que o comprador vê em
 *     "Meus pedidos";
 *   - `'false'` → API real via `httpClient`.
 *
 * API real — contrato fechado pelo back em 05/10 (back-end#250, #251):
 *   `GET  /admin/payments?status=&q=&page=`  → Page[ReceiptReviewResponse]; `q`
 *        casa nome do comprador ou da loja (não o número do Pedido) (#250)
 *   `POST /admin/payments/{order_id}/approve` → resposta PARCIAL (#251)
 *   `POST /admin/payments/{order_id}/reject` { reason } → resposta PARCIAL (#251)
 *   `GET  /admin/payments/{order_id}/receipt` (arquivo; vira `receiptUrl`)
 *   `GET  /admin/payments/{order_id}` → ReceiptReviewResponse (relê um item;
 *        rota PROPOSTA, não confirmada no contrato: usada só quando o item
 *        não está guardado)
 *
 * Resposta parcial de aprovar/rejeitar: `{ order_id, status, payment {
 * status, validated_by, validated_at[, rejection_reason] } }`. Sem comprador,
 * loja, peças, valores nem `receiptUrl`. Por isso o service mescla `payment` da
 * resposta no item que já carregou (`listReceipts`; se não tiver, relê o
 * item) e devolve o `ReceiptReview` COMPLETO: a tela nunca recebe campo vazio.
 *
 * O back responde 403 a quem não é admin: vira `FORBIDDEN`; 409 (Pedido fora de
 * `em_analise`: outra pessoa já validou, inclusive a segunda ação) vira
 * `ALREADY_VALIDATED`; 422 (motivo vazio) vira `REASON_REQUIRED`. Ao aprovar, a
 * peça sai de Reservada e vira Vendida (no mock também).
 *
 * Usage:
 *   import { listReceipts, approveReceipt, rejectReceipt } from '@/services/adminReceiptService';
 *
 *   const { items } = await listReceipts({ status: 'pendente', q: 'ana' });
 *   await approveReceipt(items[0].orderId);
 *   await rejectReceipt(orderId, 'Comprovante ilegível.');
 */

const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Erro da área admin com `code` tipado mesmo formato em mock e API real.
 * Códigos: `FORBIDDEN`, `REASON_REQUIRED`, `ORDER_NOT_FOUND`,
 * `ALREADY_VALIDATED`, `INTERNAL_ERROR` (+ os que o back enviar).
 */
export class AdminReceiptError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminReceiptError';
  }
}

/** Valida antes de qualquer chamada (mock ou API). */
function normalizeReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    throw new AdminReceiptError('REASON_REQUIRED', 'Informe o motivo da rejeição.');
  }
  return trimmed;
}

function receiptRoute(orderId: string): string {
  return `/api/admin/payments/${orderId}/receipt`;
}

// ---------------------------------------------------------------------------
// Modo MOCK — lê/escreve o armazenamento de Pedidos do `orderService`.
// ---------------------------------------------------------------------------

/** Prefixo de `orderStorageKey` em `orderService` (`orders:${userId}`). */
const ORDERS_KEY_PREFIX = 'orders:';

/** Auditoria da validação (RN-22), por Pedido — o `Order` do comprador não guarda isso. */
const VALIDATIONS_KEY = 'adminValidations';

/** Usuário admin do mock (`validatedBy`). */
const MOCK_ADMIN = { id: 'u_admin', name: 'Admin Vintex' };

interface StoredValidation {
  validatedBy: { id: string; name: string };
  validatedAt: string;
}

/** Pedido real que já recebeu comprovante (`payment` não nulo), com o dono dele. */
interface PaidOrder {
  userId: string;
  order: Order;
  payment: NonNullable<Order['payment']>;
}

/** Pedidos reais com comprovante enviado, de TODOS os compradores do mock. */
function readAllPaidOrders(): PaidOrder[] {
  const paid: PaidOrder[] = [];
  for (const [key, value] of Object.entries(window.sessionStorage)) {
    if (!key.startsWith(ORDERS_KEY_PREFIX)) continue;
    const userId = key.slice(ORDERS_KEY_PREFIX.length);
    for (const order of JSON.parse(value) as Order[]) {
      if (order.payment) paid.push({ userId, order, payment: order.payment });
    }
  }
  return paid;
}

function readValidations(): Record<string, StoredValidation> {
  const raw = window.sessionStorage.getItem(VALIDATIONS_KEY);
  return raw ? (JSON.parse(raw) as Record<string, StoredValidation>) : {};
}

function writeValidation(orderId: string): void {
  const validation: StoredValidation = {
    validatedBy: MOCK_ADMIN,
    validatedAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(
    VALIDATIONS_KEY,
    JSON.stringify({ ...readValidations(), [orderId]: validation }),
  );
}

/** 409: só comprovante pendente (Pedido em `em_analise`) pode ser validado. */
function assertInReview({ order, payment }: PaidOrder): void {
  if (payment.status !== 'pendente') {
    throw new AdminReceiptError(
      'ALREADY_VALIDATED',
      `O Pedido ${order.id} não está em análise: o comprovante já foi validado.`,
    );
  }
}

function receiptTypeFromName(name?: string): 'image' | 'pdf' {
  return name?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toReview(
  { userId, order, payment }: PaidOrder,
  validations: Record<string, StoredValidation>,
): ReceiptReview {
  const validation = validations[order.id];

  return {
    orderId: order.id,
    // O mock de Pedidos não guarda dados do comprador: deriva do `userId`.
    buyer: { name: userId, email: `${userId}@mock.vintex` },
    store: { id: order.store.id, name: order.store.name, pixKey: order.store.pixKey },
    items: order.items,
    totalAmount: order.totalAmount,
    platformFee: order.platformFee,
    sellerNetAmount: roundMoney(order.totalAmount - order.platformFee),
    payment: {
      status: payment.status,
      receiptUrl: receiptRoute(order.id),
      receiptType: receiptTypeFromName(payment.receiptName),
      submittedAt: payment.submittedAt ?? order.createdAt,
      validatedBy: validation?.validatedBy,
      validatedAt: validation?.validatedAt,
      rejectionReason: payment.rejectionReason,
    },
  };
}

function matchesQuery(review: ReceiptReview, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  // back-end#250: `q` casa nome do comprador ou da loja (não o número do Pedido).
  const haystack = [review.buyer.name, review.store.name];
  return haystack.some((value) => value.toLowerCase().includes(needle));
}

/** Pedido com comprovante enviado; sem ele não há o que validar. */
function findPaidOrder(orderId: string): PaidOrder {
  const found = readAllPaidOrders().find(({ order }) => order.id === orderId);
  if (!found) {
    throw new AdminReceiptError('ORDER_NOT_FOUND', `Pedido ${orderId} não encontrado.`);
  }
  return found;
}

function mockListReceipts(params: ListReceiptsParams): Paginated<ReceiptReview> {
  const validations = readValidations();
  const page = params.page ?? 1;

  const all = readAllPaidOrders()
    .map((paid) => toReview(paid, validations))
    .filter((review) => !params.status || review.payment.status === params.status)
    .filter((review) => matchesQuery(review, params.q ?? ''))
    .sort((a, b) => b.payment.submittedAt.localeCompare(a.payment.submittedAt));

  const start = (page - 1) * DEFAULT_PAGE_SIZE;
  return {
    items: all.slice(start, start + DEFAULT_PAGE_SIZE),
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    total: all.length,
  };
}

async function mockApproveReceipt(orderId: string): Promise<ReceiptReview> {
  const paid = findPaidOrder(orderId);
  assertInReview(paid);

  await approveOrderReceipt(paid.userId, orderId);
  writeValidation(orderId);
  return toReview(findPaidOrder(orderId), readValidations());
}

async function mockRejectReceipt(orderId: string, reason: string): Promise<ReceiptReview> {
  const paid = findPaidOrder(orderId);
  assertInReview(paid);

  await rejectOrderReceipt(paid.userId, orderId, reason);
  writeValidation(orderId);
  return toReview(findPaidOrder(orderId), readValidations());
}

// Modo API REAL — proposta do front, não confirmada (ver doc do arquivo).
// Dinheiro: `decimal(10,2)` pode vir como string ou número.

function toMoney(value: string | number): number {
  return typeof value === 'string' ? Number(value) : value;
}

interface ApiOrderItem {
  product_id: number | string;
  name: string;
  price: number | string;
  cover_image_url: string | null;
}

interface ApiReceiptReview {
  order_id: number | string;
  buyer: { name: string; email: string; phone?: string | null };
  store: {
    id: number | string;
    name: string;
    seller_name?: string | null;
    pix_key: string | null;
  };
  items: ApiOrderItem[];
  total_amount: number | string;
  platform_fee: number | string;
  seller_net_amount: number | string;
  payment: {
    status: PaymentStatus;
    receipt_url?: string;
    receipt_type: 'image' | 'pdf';
    submitted_at: string;
    validated_by?: { id: number | string; name: string } | null;
    validated_at?: string | null;
    rejection_reason?: string | null;
  };
}

/** Resposta PARCIAL de aprovar/rejeitar (back-end#251). */
interface ApiValidationResponse {
  order_id: number | string;
  status: string;
  payment: {
    status: PaymentStatus;
    validated_by?: { id: number | string; name: string } | null;
    validated_at?: string | null;
    rejection_reason?: string | null;
  };
}

interface ApiPage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

function mapApiItem(item: ApiOrderItem): OrderItem {
  return {
    productId: String(item.product_id),
    name: item.name,
    price: toMoney(item.price),
    coverImageUrl: item.cover_image_url,
  };
}

function mapApiReview(data: ApiReceiptReview): ReceiptReview {
  const orderId = String(data.order_id);
  return {
    orderId,
    buyer: {
      name: data.buyer.name,
      email: data.buyer.email,
      phone: data.buyer.phone ?? undefined,
    },
    store: {
      id: String(data.store.id),
      name: data.store.name,
      sellerName: data.store.seller_name ?? undefined,
      pixKey: data.store.pix_key,
    },
    items: data.items.map(mapApiItem),
    totalAmount: toMoney(data.total_amount),
    platformFee: toMoney(data.platform_fee),
    sellerNetAmount: toMoney(data.seller_net_amount),
    payment: {
      status: data.payment.status,
      // Sempre a rota autenticada (a mídia pública não serve comprovante).
      receiptUrl: data.payment.receipt_url ?? receiptRoute(orderId),
      receiptType: data.payment.receipt_type,
      submittedAt: data.payment.submitted_at,
      validatedBy: data.payment.validated_by
        ? { id: String(data.payment.validated_by.id), name: data.payment.validated_by.name }
        : undefined,
      validatedAt: data.payment.validated_at ?? undefined,
      rejectionReason: data.payment.rejection_reason ?? undefined,
    },
  };
}

/**
 * Último item de cada Pedido que a fila carregou (`listReceipts`): base da mescla com a resposta parcial de aprovar/rejeitar.
 */
const loadedReviews = new Map<string, ReceiptReview>();

function remember(review: ReceiptReview): ReceiptReview {
  loadedReviews.set(review.orderId, review);
  return review;
}

/** Mescla `payment` da resposta parcial no item completo (sem campo vazio). */
function mergeValidation(base: ReceiptReview, partial: ApiValidationResponse): ReceiptReview {
  const { payment } = partial;
  return remember({
    ...base,
    payment: {
      ...base.payment,
      status: payment.status,
      validatedBy: payment.validated_by
        ? { id: String(payment.validated_by.id), name: payment.validated_by.name }
        : undefined,
      validatedAt: payment.validated_at ?? undefined,
      rejectionReason: payment.rejection_reason ?? undefined,
    },
  });
}

async function validate(
  orderId: string,
  path: 'approve' | 'reject',
  body?: { reason: string },
): Promise<ReceiptReview> {
  let partial: ApiValidationResponse;
  try {
    ({ data: partial } = await httpClient.post<ApiValidationResponse>(
      `/admin/payments/${orderId}/${path}`,
      body,
    ));
  } catch (error) {
    throw toAdminError(error);
  }
  // Item que a fila não carregou: relê (rota proposta) para ter o item completo.
  const base = loadedReviews.get(orderId) ?? (await apiGetReceiptReview(orderId));
  return mergeValidation(base, partial);
}

function toAdminError(error: unknown): AdminReceiptError {
  const response = (
    error as {
      response?: { status?: number; data?: { error?: { code?: string; message?: string } } };
    }
  ).response;

  // 409 e 422 do contrato de aprovar/rejeitar (back-end#251): pelo status HTTP,
  // antes de olhar o envelope.
  if (response?.status === 409) {
    return new AdminReceiptError(
      'ALREADY_VALIDATED',
      'O comprovante já foi validado por outra pessoa.',
    );
  }
  if (response?.status === 422) {
    return new AdminReceiptError('REASON_REQUIRED', 'Informe o motivo da rejeição.');
  }
  // 403 é "sem permissão", nunca erro genérico.
  if (response?.status === 403) {
    return new AdminReceiptError(
      'FORBIDDEN',
      response.data?.error?.message ?? 'Você não tem permissão para esta ação.',
    );
  }
  const apiError = response?.data?.error;
  if (apiError?.code) {
    return new AdminReceiptError(apiError.code, apiError.message ?? 'Erro ao validar comprovante.');
  }
  return new AdminReceiptError('INTERNAL_ERROR', 'Erro ao validar comprovante.');
}

async function apiListReceipts(params: ListReceiptsParams): Promise<Paginated<ReceiptReview>> {
  try {
    const { data } = await httpClient.get<ApiPage<ApiReceiptReview>>('/admin/payments', {
      params: { status: params.status, q: params.q || undefined, page: params.page },
    });
    return {
      items: data.items.map(mapApiReview).map(remember),
      page: data.page,
      pageSize: data.page_size,
      total: data.total,
    };
  } catch (error) {
    throw toAdminError(error);
  }
}

function apiApproveReceipt(orderId: string): Promise<ReceiptReview> {
  return validate(orderId, 'approve');
}

function apiRejectReceipt(orderId: string, reason: string): Promise<ReceiptReview> {
  return validate(orderId, 'reject', { reason });
}

async function apiGetReceiptReview(orderId: string): Promise<ReceiptReview> {
  try {
    const { data } = await httpClient.get<ApiReceiptReview>(`/admin/payments/${orderId}`);
    return remember(mapApiReview(data));
  } catch (error) {
    throw toAdminError(error);
  }
}

// Seleção do modo.

/** Fila de comprovantes, com filtro por situação (`status`) e busca (`q`). */
export function listReceipts(params: ListReceiptsParams = {}): Promise<Paginated<ReceiptReview>> {
  return useMocks ? Promise.resolve(mockListReceipts(params)) : apiListReceipts(params);
}

/** Aprova o comprovante: o Pedido avança para `confirmado` (RN-22). */
export function approveReceipt(orderId: string): Promise<ReceiptReview> {
  return useMocks ? mockApproveReceipt(orderId) : apiApproveReceipt(orderId);
}

/** Rejeita com motivo obrigatório; o Pedido volta ao comprador (RN-23). */
export async function rejectReceipt(orderId: string, reason: string): Promise<ReceiptReview> {
  const normalized = normalizeReason(reason);
  return useMocks ? mockRejectReceipt(orderId, normalized) : apiRejectReceipt(orderId, normalized);
}
