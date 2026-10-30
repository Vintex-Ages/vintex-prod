import { httpClient } from '@/services/httpClient';
import {
  ORDER_REPORT_REASONS,
  type AdminOrderReport,
  type ListReportsParams,
  type OrderReport,
  type OrderReportReason,
} from '@/types/report';
import type { Paginated } from '@/types/product';

/**
 * Service de Reclamações sobre Pedidos (FE-SVC-order-reports, issue #426).
 *
 * FLAG `VITE_USE_MOCKS` (mesmo padrão de `orderService`/`adminReceiptService`):
 *   - ausente ou `'true'` → mock sobre o `sessionStorage` do `orderService`
 *     (lê os Pedidos de todos os compradores do mock e guarda as Reclamações);
 *   - `'false'` → API real via `httpClient`.
 *
 * API real CONTRATO PROPOSTO pelo front (back-end#268), não fixado pelo back.
 * O back fixa; o front segue o que vier. A diferença, se houver, é corrigida
 * aqui no service (a tela não muda):
 *   `POST /users/me/orders/{order_id}/reports` { reason, description }
 *        → 201 { id, order_id, reason, description, created_at }
 *   `GET  /admin/reports?page=&page_size=`
 *        → 200 { items: [{ id, order_id, reason, description, created_at,
 *                          buyer: { id, name }, store: { id, name } }],
 *                page, page_size, total }
 *
 * O comprador NÃO tem rota para ler a Reclamação que enviou (pendência no plano
 * da S4): por isso o service não oferece essa leitura.
 *
 * Usage:
 *   import { reportOrder, listReports } from '@/services/reportService';
 *
 *   const report = await reportOrder('42', 'danificado', 'A manga veio rasgada.');
 *   const { items, total } = await listReports({ page: 1 });
 */

const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

const DEFAULT_PAGE_SIZE = 20;

/** Campo da tela a que um `422` se refere. */
export type OrderReportField = 'reason' | 'description';

/**
 * Erro de Reclamação com `code` tipado, igual em mock e API real.
 * Códigos: `FORBIDDEN`, `ORDER_NOT_FOUND`, `VALIDATION_ERROR` (com `field`),
 * `ORDER_NOT_REPORTABLE`, `INTERNAL_ERROR`.
 */
export class OrderReportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: OrderReportField,
  ) {
    super(message);
    this.name = 'OrderReportError';
  }
}

const REASON_ERROR = 'Escolha um dos motivos: não recebido ou danificado.';
const DESCRIPTION_ERROR = 'Descreva o problema.';

/** Valida antes de qualquer chamada (mock ou API): o `422` já sai com o campo. */
function normalizeInput(
  reason: OrderReportReason,
  description: string,
): { reason: OrderReportReason; description: string } {
  if (!ORDER_REPORT_REASONS.includes(reason)) {
    throw new OrderReportError('VALIDATION_ERROR', REASON_ERROR, 'reason');
  }
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    throw new OrderReportError('VALIDATION_ERROR', DESCRIPTION_ERROR, 'description');
  }
  return { reason, description: trimmed };
}

// ---------------------------------------------------------------------------
// Modo MOCK — lê os Pedidos do `orderService` e guarda as Reclamações.
// ---------------------------------------------------------------------------

/** Prefixo de `orderStorageKey` em `orderService` (`orders:${userId}`). */
const ORDERS_KEY_PREFIX = 'orders:';

const REPORTS_KEY = 'orderReports';

/** Só Pedido já confirmado pode ser reportado (RN-77). */
const REPORTABLE_STATUSES = ['confirmado', 'preparando', 'enviado', 'concluido'];

interface StoredOrder {
  id: string;
  status: string;
  store: { id: string; name: string };
}

function readReports(): AdminOrderReport[] {
  const raw = window.sessionStorage.getItem(REPORTS_KEY);
  return raw ? (JSON.parse(raw) as AdminOrderReport[]) : [];
}

/** Pedido real com o dono dele; `null` se não existe (o mock não distingue "de outra pessoa"). */
function findOrder(orderId: string): { userId: string; order: StoredOrder } | null {
  for (const [key, value] of Object.entries(window.sessionStorage)) {
    if (!key.startsWith(ORDERS_KEY_PREFIX)) continue;
    const order = (JSON.parse(value) as StoredOrder[]).find(({ id }) => id === orderId);
    if (order) return { userId: key.slice(ORDERS_KEY_PREFIX.length), order };
  }
  return null;
}

function mockReportOrder(
  orderId: string,
  reason: OrderReportReason,
  description: string,
): OrderReport {
  const found = findOrder(orderId);
  if (!found) {
    throw new OrderReportError('ORDER_NOT_FOUND', `Pedido ${orderId} não encontrado.`);
  }
  if (!REPORTABLE_STATUSES.includes(found.order.status)) {
    throw new OrderReportError(
      'ORDER_NOT_REPORTABLE',
      'Só é possível reportar um Pedido depois da confirmação.',
    );
  }

  const reports = readReports();
  const stored: AdminOrderReport = {
    id: `r_${reports.length + 1}`,
    orderId,
    reason,
    description,
    createdAt: new Date().toISOString(),
    // O mock de Pedidos não guarda dados do comprador: deriva do `userId`.
    buyer: { id: found.userId, name: found.userId },
    store: { id: found.order.store.id, name: found.order.store.name },
  };
  window.sessionStorage.setItem(REPORTS_KEY, JSON.stringify([...reports, stored]));

  // O comprador recebe só a Reclamação, no formato do 201 (sem comprador nem loja).
  return {
    id: stored.id,
    orderId: stored.orderId,
    reason: stored.reason,
    description: stored.description,
    createdAt: stored.createdAt,
  };
}

function mockListReports(params: ListReportsParams): Paginated<AdminOrderReport> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  // A mais recente primeiro.
  const all = [...readReports()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const start = (page - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), page, pageSize, total: all.length };
}

// ---------------------------------------------------------------------------
// Modo API REAL — proposta do front, não confirmada (ver doc do arquivo).
// ---------------------------------------------------------------------------

interface ApiReport {
  id: number | string;
  order_id: number | string;
  reason: OrderReportReason;
  description: string;
  created_at: string;
}

interface ApiAdminReport extends ApiReport {
  buyer: { id: number | string; name: string };
  store: { id: number | string; name: string };
}

interface ApiPage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

function mapApiReport(data: ApiReport): OrderReport {
  return {
    id: String(data.id),
    orderId: String(data.order_id),
    reason: data.reason,
    description: data.description,
    createdAt: data.created_at,
  };
}

function mapApiAdminReport(data: ApiAdminReport): AdminOrderReport {
  return {
    ...mapApiReport(data),
    buyer: { id: String(data.buyer.id), name: data.buyer.name },
    store: { id: String(data.store.id), name: data.store.name },
  };
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    field?: string;
    fields?: Record<string, string>;
  };
}

function isReportField(value: string | undefined): value is OrderReportField {
  return value === 'reason' || value === 'description';
}

/** Campo do `422`: `error.field` ou a primeira chave conhecida de `error.fields`. */
function validationField(error: ApiErrorBody['error']): OrderReportField | undefined {
  if (isReportField(error?.field)) return error.field;
  return Object.keys(error?.fields ?? {}).find(isReportField);
}

function toReportError(error: unknown): OrderReportError {
  const response = (error as { response?: { status?: number; data?: ApiErrorBody } }).response;
  const apiError = response?.data?.error;

  if (response?.status === 422) {
    const field = validationField(apiError);
    return new OrderReportError(
      'VALIDATION_ERROR',
      (field && apiError?.fields?.[field]) ||
        apiError?.message ||
        (field === 'reason' ? REASON_ERROR : DESCRIPTION_ERROR),
      field,
    );
  }
  // 404: o Pedido não existe ou é de outra pessoa (o back não distingue).
  if (response?.status === 404) {
    return new OrderReportError('ORDER_NOT_FOUND', 'Pedido não encontrado.');
  }
  // 403 é "sem permissão", nunca erro genérico.
  if (response?.status === 403) {
    return new OrderReportError(
      'FORBIDDEN',
      apiError?.message ?? 'Você não tem permissão para esta ação.',
    );
  }
  // Pedido em status que não permite reportar: o back fixa o código, o front mostra a mensagem dele.
  if (apiError?.code) {
    return new OrderReportError(apiError.code, apiError.message ?? 'Erro ao enviar a Reclamação.');
  }
  return new OrderReportError('INTERNAL_ERROR', 'Erro ao processar a Reclamação.');
}

async function apiReportOrder(
  orderId: string,
  reason: OrderReportReason,
  description: string,
): Promise<OrderReport> {
  try {
    const { data } = await httpClient.post<ApiReport>(`/users/me/orders/${orderId}/reports`, {
      reason,
      description,
    });
    return mapApiReport(data);
  } catch (error) {
    throw toReportError(error);
  }
}

async function apiListReports(params: ListReportsParams): Promise<Paginated<AdminOrderReport>> {
  try {
    const { data } = await httpClient.get<ApiPage<ApiAdminReport>>('/admin/reports', {
      params: { page: params.page, page_size: params.pageSize },
    });
    return {
      items: data.items.map(mapApiAdminReport),
      page: data.page,
      pageSize: data.page_size,
      total: data.total,
    };
  } catch (error) {
    throw toReportError(error);
  }
}

// Seleção do modo.

/** Comprador envia uma Reclamação sobre um Pedido dele (RN-77, RN-27). */
export async function reportOrder(
  orderId: string,
  reason: OrderReportReason,
  description: string,
): Promise<OrderReport> {
  const input = normalizeInput(reason, description);
  return useMocks
    ? mockReportOrder(orderId, input.reason, input.description)
    : apiReportOrder(orderId, input.reason, input.description);
}

/** Administradora lista as Reclamações, paginado (RN-78). */
export function listReports(params: ListReportsParams = {}): Promise<Paginated<AdminOrderReport>> {
  return useMocks ? Promise.resolve(mockListReports(params)) : apiListReports(params);
}
