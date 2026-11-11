import { products } from '@/mocks/products';
import { httpClient } from '@/services/httpClient';
import type { AdminDashboard, StoreSales } from '@/types/dashboard';
import { DEFAULT_COMMISSION_RATE } from '@/utils/commission';

/**
 * Service do painel geral da administradora (FE-SVC-admin-dashboard, issue #431).
 *
 * FLAG `VITE_USE_MOCKS` (mesmo padrão de `orderService`/`adminReceiptService`):
 *   - ausente ou `'true'` → mock calculado sobre o `sessionStorage` do
 *     `orderService` (os Pedidos confirmados) e sobre as peças do catálogo
 *     de demonstração;
 *   - `'false'` → API real via `httpClient`.
 *
 * API real — CONTRATO PROPOSTO pelo front (back-end#269), não fixado pelo back.
 * O back fixou só o que os números significam, não o caminho nem os campos. O
 * back fixa; o front segue o que vier, e a diferença se corrige aqui no
 * service (a tela não muda):
 *   `GET /admin/dashboard`
 *        → 200 { stores_count, users_count, active_products_count,
 *                sales_volume, commission_total,
 *                sales_by_store: [{ store_id, store_name, amount }] }
 *
 * Os valores vêm como número no JSON, nunca string (back-end#212). Plataforma
 * sem venda: zero nos valores e lista vazia, sem erro.
 *
 * Erros: `401` sem sessão → `UNAUTHENTICATED`; `403` sem o papel de
 * administradora → `FORBIDDEN` (RN-32). Ambos viram `AdminDashboardError`
 * tratável, com o `code` igual em mock e API real.
 *
 * Regras: RN-22 (histórico de pagamento, base dos números), RN-11 (comissão de
 * 9%), RN-32 (autorizado por papel).
 *
 * Usage:
 *   import { getDashboard } from '@/services/dashboardService';
 *
 *   const { salesVolume, commissionTotal, salesByStore } = await getDashboard();
 */

const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

/**
 * Erro do painel com `code` tipado, igual em mock e API real.
 * Códigos: `UNAUTHENTICATED`, `FORBIDDEN`, `INTERNAL_ERROR` (+ os que o back enviar).
 */
export class AdminDashboardError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminDashboardError';
  }
}

// ---------------------------------------------------------------------------
// Modo MOCK — lê os Pedidos do `orderService` e as peças do catálogo.
// ---------------------------------------------------------------------------

/** Prefixo de `orderStorageKey` em `orderService` (`orders:${userId}`). */
const ORDERS_KEY_PREFIX = 'orders:';

/** Status em que o Pedido ainda não tem pagamento validado (ou expirou): não conta nas vendas. */
const UNCONFIRMED_STATUSES = ['aguardando_comprovante', 'em_analise', 'expirado'];

interface StoredOrder {
  status: string;
  totalAmount: number;
  store: { id: string; name: string };
}

/** Pedidos de todos os compradores do mock, com o dono de cada um. */
function readAllOrders(): { userId: string; order: StoredOrder }[] {
  const all: { userId: string; order: StoredOrder }[] = [];
  for (const [key, value] of Object.entries(window.sessionStorage)) {
    if (!key.startsWith(ORDERS_KEY_PREFIX)) continue;
    const userId = key.slice(ORDERS_KEY_PREFIX.length);
    for (const order of JSON.parse(value) as StoredOrder[]) all.push({ userId, order });
  }
  return all;
}

/** Soma em centavos inteiros: em float `0.1 + 0.2` não dá `0.3`. */
function toCents(value: number): number {
  return Math.round(value * 100);
}

function mockGetDashboard(): AdminDashboard {
  const confirmed = readAllOrders().filter(
    ({ order }) => !UNCONFIRMED_STATUSES.includes(order.status),
  );

  const byStore = new Map<string, { storeName: string; cents: number }>();
  let volumeCents = 0;
  for (const { order } of confirmed) {
    const cents = toCents(order.totalAmount);
    volumeCents += cents;
    const current = byStore.get(order.store.id);
    byStore.set(order.store.id, {
      storeName: order.store.name,
      cents: (current?.cents ?? 0) + cents,
    });
  }

  const salesByStore: StoreSales[] = [...byStore.entries()]
    .map(([storeId, { storeName, cents }]) => ({ storeId, storeName, amount: cents / 100 }))
    // A loja que mais vendeu primeiro.
    .sort((a, b) => b.amount - a.amount);

  const storeIds = new Set(products.map((product) => product.store.id));
  // O mock de usuários não existe como lista: conta quem comprou mais um vendedor por loja.
  const buyerIds = new Set(readAllOrders().map(({ userId }) => userId));

  return {
    storesCount: storeIds.size,
    usersCount: buyerIds.size + storeIds.size,
    activeProductsCount: products.filter((product) => product.status === 'ativo').length,
    salesVolume: volumeCents / 100,
    // RN-11: 9% sobre o volume, arredondado ao centavo mais próximo.
    commissionTotal: Math.round(volumeCents * DEFAULT_COMMISSION_RATE) / 100,
    salesByStore,
  };
}

// ---------------------------------------------------------------------------
// Modo API REAL — proposta do front, não confirmada (ver doc do arquivo).
// ---------------------------------------------------------------------------

interface ApiDashboard {
  stores_count: number;
  users_count: number;
  active_products_count: number;
  sales_volume: number;
  commission_total: number;
  sales_by_store: { store_id: number | string; store_name: string; amount: number }[];
}

function mapApiDashboard(data: ApiDashboard): AdminDashboard {
  return {
    storesCount: data.stores_count,
    usersCount: data.users_count,
    activeProductsCount: data.active_products_count,
    salesVolume: data.sales_volume,
    commissionTotal: data.commission_total,
    salesByStore: data.sales_by_store.map((sale) => ({
      storeId: String(sale.store_id),
      storeName: sale.store_name,
      amount: sale.amount,
    })),
  };
}

function toDashboardError(error: unknown): AdminDashboardError {
  const response = (
    error as {
      response?: { status?: number; data?: { error?: { code?: string; message?: string } } };
    }
  ).response;

  if (response?.status === 401) {
    return new AdminDashboardError(
      'UNAUTHENTICATED',
      response.data?.error?.message ?? 'Entre na sua conta para ver o painel.',
    );
  }
  // 403 é "sem permissão", nunca erro genérico.
  if (response?.status === 403) {
    return new AdminDashboardError(
      'FORBIDDEN',
      response.data?.error?.message ?? 'Você não tem permissão para ver o painel.',
    );
  }
  const apiError = response?.data?.error;
  if (apiError?.code) {
    return new AdminDashboardError(apiError.code, apiError.message ?? 'Erro ao carregar o painel.');
  }
  return new AdminDashboardError('INTERNAL_ERROR', 'Erro ao carregar o painel.');
}

async function apiGetDashboard(): Promise<AdminDashboard> {
  try {
    const { data } = await httpClient.get<ApiDashboard>('/admin/dashboard');
    return mapApiDashboard(data);
  } catch (error) {
    throw toDashboardError(error);
  }
}

// Seleção do modo.

/** Números gerais da plataforma para a administradora, numa chamada só. */
export function getDashboard(): Promise<AdminDashboard> {
  return useMocks ? Promise.resolve(mockGetDashboard()) : apiGetDashboard();
}
