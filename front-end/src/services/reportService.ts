import { httpClient } from '@/services/httpClient';
import { findExampleOrder } from '@/services/orderService';
import {
  ORDER_REPORT_DESCRIPTION_MAX_LENGTH,
  ORDER_REPORT_REASONS,
  type AdminOrderReport,
  type ListReportsParams,
  type OrderReport,
  type OrderReportReason,
} from '@/types/report';
import type { OrderStatus } from '@/types/order';
import type { Paginated } from '@/types/product';

/**
 * Service de Reclamações sobre Pedidos (FE-SVC-order-reports, issue #426).
 *
 * FLAG `VITE_USE_MOCKS` (mesmo padrão de `orderService`/`adminReceiptService`):
 *   - ausente ou `'true'` → mock sobre o `sessionStorage` do `orderService`
 *     (lê os Pedidos de todos os compradores do mock e guarda as Reclamações);
 *   - `'false'` → API real via `httpClient`.
 *
 * API real — rotas do back (back-end#268, alinhadas no #441). Qualquer
 * diferença de formato é corrigida aqui no service (a tela não muda):
 *   `POST /users/me/orders/{order_id}/complaints` { reason, description }
 *        → 201 { id, order_id, reason, description, created_at }
 *        → 409 `ALREADY_REPORTED` (o Pedido já tem Reclamação) ou
 *              `COMPLAINT_NOT_ALLOWED` (ainda não confirmado)
 *        → 422 motivo fora dos dois ou descrição vazia / acima de 1000
 *   `GET  /admin/complaints?page=&page_size=`
 *        → 200 { items: [{ id, reason, description, created_at,
 *                          buyer: { name, email, phone },
 *                          order: { id, status, store: { id, name, … }, items,
 *                                   total_amount } }],
 *                page, page_size, total }
 *   Na API real, a ordem da lista é a do back (back-end#353): o service não
 *   reordena. O mock continua com a mais recente primeiro.
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
 * `COMPLAINT_NOT_ALLOWED`, `ALREADY_REPORTED`, `INTERNAL_ERROR`; da API real,
 * qualquer outro código do back chega como veio.
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

/** Só Pedido já confirmado pode ser reportado (RN-77). */
const REPORTABLE_STATUSES: readonly OrderStatus[] = [
  'confirmado',
  'preparando',
  'enviado',
  'concluido',
];

/**
 * Se o Pedido aceita Reclamação (RN-77). A mesma regra decide o botão
 * "Reportar problema" no `OrderCard` e no detalhe do Pedido (#410) e a
 * recusa `COMPLAINT_NOT_ALLOWED` do mock.
 */
export function canReportOrder(status: OrderStatus): boolean {
  return REPORTABLE_STATUSES.includes(status);
}

const REASON_ERROR = 'Escolha um dos motivos: não recebido ou danificado.';
const DESCRIPTION_ERROR = 'Descreva o problema.';
const DESCRIPTION_TOO_LONG = `A descrição pode ter até ${ORDER_REPORT_DESCRIPTION_MAX_LENGTH} caracteres.`;
const ALREADY_REPORTED_MESSAGE = 'Este pedido já tem um problema reportado.';
/** Mesma recusa do back (`order_complaint_controller.py:49`). */
const COMPLAINT_NOT_ALLOWED_MESSAGE =
  'Só dá para reportar um problema depois que o pedido é confirmado.';

/**
 * Valida antes de qualquer chamada (mock ou API), como o back: tira os espaços
 * das pontas e só então confere vazio e o teto. O `422` já sai com o campo.
 */
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
  if (trimmed.length > ORDER_REPORT_DESCRIPTION_MAX_LENGTH) {
    throw new OrderReportError('VALIDATION_ERROR', DESCRIPTION_TOO_LONG, 'description');
  }
  return { reason, description: trimmed };
}

// ---------------------------------------------------------------------------
// Modo MOCK — lê os Pedidos do `orderService` e guarda as Reclamações.
// ---------------------------------------------------------------------------

/** Prefixo de `orderStorageKey` em `orderService` (`orders:${userId}`). */
const ORDERS_KEY_PREFIX = 'orders:';

const REPORTS_KEY = 'orderReports';

/**
 * Comprador gravado na Reclamação de um Pedido de exemplo: os exemplos são
 * compartilhados por todos os compradores do mock e não têm dono.
 */
const EXAMPLE_BUYER_ID = 'exemplo';

interface StoredOrder {
  id: string;
  status: string;
  store: { id: string; name: string };
}

function readReports(): AdminOrderReport[] {
  const raw = window.sessionStorage.getItem(REPORTS_KEY);
  return raw ? (JSON.parse(raw) as AdminOrderReport[]) : [];
}

/**
 * Pedido com o dono dele; `null` se não existe (o mock não distingue "de outra
 * pessoa"). Primeiro os Pedidos criados no `sessionStorage`; depois os de
 * exemplo de "Meus pedidos", que ficam no `orderService` e não têm dono.
 */
function findOrder(orderId: string): { userId: string; order: StoredOrder } | null {
  for (const [key, value] of Object.entries(window.sessionStorage)) {
    if (!key.startsWith(ORDERS_KEY_PREFIX)) continue;
    const order = (JSON.parse(value) as StoredOrder[]).find(({ id }) => id === orderId);
    if (order) return { userId: key.slice(ORDERS_KEY_PREFIX.length), order };
  }
  const example = findExampleOrder(orderId);
  return example ? { userId: EXAMPLE_BUYER_ID, order: example } : null;
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
  if (!canReportOrder(found.order.status as OrderStatus)) {
    throw new OrderReportError('COMPLAINT_NOT_ALLOWED', COMPLAINT_NOT_ALLOWED_MESSAGE);
  }

  const reports = readReports();
  // Como o `UNIQUE` de `order_id` no back: uma Reclamação por Pedido (409).
  if (reports.some((report) => report.orderId === orderId)) {
    throw new OrderReportError('ALREADY_REPORTED', ALREADY_REPORTED_MESSAGE);
  }

  const stored: AdminOrderReport = {
    id: `r_${reports.length + 1}`,
    orderId,
    reason,
    description,
    createdAt: new Date().toISOString(),
    // O mock de Pedidos não guarda dados do comprador: deriva do `userId`,
    // sem id (como o back) e com o e-mail no mesmo padrão do `adminReceiptService`.
    buyer: { name: found.userId, email: `${found.userId}@mock.vintex` },
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
// Modo API REAL — rotas do back (ver doc do arquivo).
// ---------------------------------------------------------------------------

/** `OrderComplaintResponse` do back: o 201 que o comprador recebe. */
interface ApiReport {
  id: number | string;
  order_id: number | string;
  reason: OrderReportReason;
  description: string;
  created_at: string;
}

/**
 * `AdminComplaintEntry` do back: sem `order_id` no topo; o Pedido vem em
 * `order` (com a loja em `order.store`) e o comprador sem id. Só os campos que
 * o service usa estão descritos.
 */
interface ApiAdminReport {
  id: number | string;
  reason: OrderReportReason;
  description: string;
  created_at: string;
  buyer: { name: string; email: string; phone: string | null };
  order: {
    id: number | string;
    store: { id: number | string; name: string };
  };
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
  const { name, email, phone } = data.buyer;
  return {
    id: String(data.id),
    orderId: String(data.order.id),
    reason: data.reason,
    description: data.description,
    createdAt: data.created_at,
    // `phone: null` fica de fora (mesmo padrão do `adminReceiptService`).
    buyer: phone ? { name, email, phone } : { name, email },
    store: { id: String(data.order.store.id), name: data.order.store.name },
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
    const { data } = await httpClient.post<ApiReport>(`/users/me/orders/${orderId}/complaints`, {
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
    const { data } = await httpClient.get<ApiPage<ApiAdminReport>>('/admin/complaints', {
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
