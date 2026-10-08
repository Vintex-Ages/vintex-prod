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
 * API real — PROPOSTA DO FRONT, NÃO CONFIRMADA: o contrato fechado em 05/10
 * (`artefatos/contratos/admin-comprovantes.md`) não estava disponível ao
 * escrever este arquivo; rotas e shape abaixo seguem o resumo da issue #312.
 * Conferir com o contrato e ajustar AQUI (nunca na tela) antes de ligar a flag:
 *   `GET  /admin/payments?status=&q=&page=`  → Page[ReceiptReviewResponse]
 *   `POST /admin/payments/{order_id}/approve`
 *   `POST /admin/payments/{order_id}/reject` { reason }
 *   `GET  /admin/payments/{order_id}/receipt` (arquivo; vira `receiptUrl`)
 * O back responde 403 a quem não é admin: vira `FORBIDDEN`.
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
 * `INTERNAL_ERROR` (+ os que o back enviar).
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
  const haystack = [
    review.orderId,
    review.buyer.name,
    review.buyer.email,
    review.store.name,
    ...review.items.map((item) => item.name),
  ];
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
  const { userId } = findPaidOrder(orderId);

  await approveOrderReceipt(userId, orderId);
  writeValidation(orderId);
  return toReview(findPaidOrder(orderId), readValidations());
}

async function mockRejectReceipt(orderId: string, reason: string): Promise<ReceiptReview> {
  const { userId } = findPaidOrder(orderId);

  await rejectOrderReceipt(userId, orderId, reason);
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

function toAdminError(error: unknown): AdminReceiptError {
  const response = (
    error as {
      response?: { status?: number; data?: { error?: { code?: string; message?: string } } };
    }
  ).response;

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
      items: data.items.map(mapApiReview),
      page: data.page,
      pageSize: data.page_size,
      total: data.total,
    };
  } catch (error) {
    throw toAdminError(error);
  }
}

async function apiApproveReceipt(orderId: string): Promise<ReceiptReview> {
  try {
    const { data } = await httpClient.post<ApiReceiptReview>(`/admin/payments/${orderId}/approve`);
    return mapApiReview(data);
  } catch (error) {
    throw toAdminError(error);
  }
}

async function apiRejectReceipt(orderId: string, reason: string): Promise<ReceiptReview> {
  try {
    const { data } = await httpClient.post<ApiReceiptReview>(`/admin/payments/${orderId}/reject`, {
      reason,
    });
    return mapApiReview(data);
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
