import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDashboardError } from './dashboardService';

type DashboardModule = typeof import('./dashboardService');

let dashboard: DashboardModule;

/** Semeia Pedidos no mesmo armazenamento que o `orderService` usa (`orders:${userId}`). */
function seedOrders(
  userId: string,
  orders: { status: string; totalAmount: number; storeId: string; storeName: string }[],
) {
  window.sessionStorage.setItem(
    `orders:${userId}`,
    JSON.stringify(
      orders.map(({ status, totalAmount, storeId, storeName }, index) => ({
        id: `${userId}-${index}`,
        status,
        totalAmount,
        store: { id: storeId, name: storeName },
      })),
    ),
  );
}

async function failure(promise: Promise<unknown>): Promise<AdminDashboardError> {
  try {
    await promise;
  } catch (error) {
    return error as AdminDashboardError;
  }
  throw new Error('A chamada deveria ter falhado.');
}

describe('dashboardService (mock)', () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    vi.resetModules();
    dashboard = await import('./dashboardService');
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('sem venda: zero nos valores e lista vazia, sem erro', async () => {
    const result = await dashboard.getDashboard();

    expect(result.salesVolume).toBe(0);
    expect(result.commissionTotal).toBe(0);
    expect(result.salesByStore).toEqual([]);
    // Contagens diretas: vêm do catálogo, não das vendas.
    expect(result.storesCount).toBeGreaterThan(0);
    expect(result.activeProductsCount).toBeGreaterThan(0);
  });

  it('devolve os seis números do contrato', async () => {
    const result = await dashboard.getDashboard();

    expect(Object.keys(result).sort()).toEqual([
      'activeProductsCount',
      'commissionTotal',
      'salesByStore',
      'salesVolume',
      'storesCount',
      'usersCount',
    ]);
    for (const key of [
      'storesCount',
      'usersCount',
      'activeProductsCount',
      'salesVolume',
      'commissionTotal',
    ] as const) {
      expect(typeof result[key]).toBe('number');
    }
  });

  it('volume soma só Pedidos confirmados; os não confirmados ficam de fora', async () => {
    seedOrders('u_ana', [
      { status: 'confirmado', totalAmount: 159.9, storeId: '1', storeName: 'Loja A' },
      { status: 'concluido', totalAmount: 79.9, storeId: '2', storeName: 'Loja B' },
      { status: 'aguardando_comprovante', totalAmount: 500, storeId: '1', storeName: 'Loja A' },
      { status: 'em_analise', totalAmount: 500, storeId: '1', storeName: 'Loja A' },
      { status: 'expirado', totalAmount: 500, storeId: '1', storeName: 'Loja A' },
    ]);

    const result = await dashboard.getDashboard();

    expect(result.salesVolume).toBe(239.8);
  });

  // RN-11: 9% sobre o volume, arredondado ao centavo.
  it('comissão é 9% do volume, sem erro de ponto flutuante', async () => {
    seedOrders('u_ana', [
      { status: 'confirmado', totalAmount: 100, storeId: '1', storeName: 'Loja A' },
      { status: 'confirmado', totalAmount: 19.9, storeId: '1', storeName: 'Loja A' },
    ]);

    const result = await dashboard.getDashboard();

    expect(result.salesVolume).toBe(119.9);
    expect(result.commissionTotal).toBe(10.79); // 119,90 × 0,09 = 10,791
  });

  it('agrupa as vendas por loja, a que mais vendeu primeiro', async () => {
    seedOrders('u_ana', [
      { status: 'confirmado', totalAmount: 50, storeId: '1', storeName: 'Loja A' },
      { status: 'confirmado', totalAmount: 200, storeId: '2', storeName: 'Loja B' },
    ]);
    seedOrders('u_bia', [
      { status: 'confirmado', totalAmount: 30, storeId: '1', storeName: 'Loja A' },
    ]);

    const result = await dashboard.getDashboard();

    expect(result.salesByStore).toEqual([
      { storeId: '2', storeName: 'Loja B', amount: 200 },
      { storeId: '1', storeName: 'Loja A', amount: 80 },
    ]);
    expect(result.salesVolume).toBe(280);
  });
});

describe('dashboardService (API real) — contrato proposto pelo front (back-end#269)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const API_DASHBOARD = {
    stores_count: 12,
    users_count: 340,
    active_products_count: 98,
    sales_volume: 4520.5,
    commission_total: 406.85,
    sales_by_store: [
      { store_id: 3, store_name: 'Roupa Rodada', amount: 3000.5 },
      { store_id: 7, store_name: 'Garimpo da Redenção', amount: 1520 },
    ],
  };

  interface Call {
    url?: string;
    method?: string;
  }

  /** Troca o adaptador do `httpClient`: `respond` devolve o corpo ou um erro com `response`. */
  async function stubAdapter(respond: () => unknown) {
    const { httpClient } = await import('@/services/httpClient');
    const calls: Call[] = [];
    httpClient.defaults.adapter = (config) => {
      calls.push({ url: config.url, method: config.method });
      const result = respond();
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve({ data: result, status: 200, statusText: 'OK', headers: {}, config });
    };
    return calls;
  }

  function httpError(status: number, error?: Record<string, unknown>) {
    return Object.assign(new Error(`HTTP ${status}`), {
      response: { status, data: error ? { error } : {} },
    });
  }

  it('getDashboard chama GET /admin/dashboard e converte os seis números e a lista por loja', async () => {
    const calls = await stubAdapter(() => API_DASHBOARD);
    const { getDashboard } = await import('./dashboardService');

    const result = await getDashboard();

    expect(calls).toEqual([{ url: '/admin/dashboard', method: 'get' }]);
    expect(result).toEqual({
      storesCount: 12,
      usersCount: 340,
      activeProductsCount: 98,
      salesVolume: 4520.5,
      commissionTotal: 406.85,
      salesByStore: [
        { storeId: '3', storeName: 'Roupa Rodada', amount: 3000.5 },
        { storeId: '7', storeName: 'Garimpo da Redenção', amount: 1520 },
      ],
    });
  });

  it('plataforma sem venda: zeros e lista vazia, sem erro', async () => {
    await stubAdapter(() => ({
      stores_count: 0,
      users_count: 0,
      active_products_count: 0,
      sales_volume: 0,
      commission_total: 0,
      sales_by_store: [],
    }));
    const { getDashboard } = await import('./dashboardService');

    const result = await getDashboard();

    expect(result).toEqual({
      storesCount: 0,
      usersCount: 0,
      activeProductsCount: 0,
      salesVolume: 0,
      commissionTotal: 0,
      salesByStore: [],
    });
  });

  it('403 vira FORBIDDEN', async () => {
    await stubAdapter(() =>
      httpError(403, { code: 'FORBIDDEN', message: 'Apenas administradora.' }),
    );
    const { getDashboard } = await import('./dashboardService');

    const error = await failure(getDashboard());

    expect(error).toMatchObject({
      name: 'AdminDashboardError',
      code: 'FORBIDDEN',
      message: 'Apenas administradora.',
    });
  });

  it('401 vira UNAUTHENTICATED', async () => {
    await stubAdapter(() => httpError(401));
    const { getDashboard } = await import('./dashboardService');

    const error = await failure(getDashboard());

    expect(error).toMatchObject({ name: 'AdminDashboardError', code: 'UNAUTHENTICATED' });
  });

  it('erro sem status vira INTERNAL_ERROR', async () => {
    await stubAdapter(() => new Error('rede fora'));
    const { getDashboard } = await import('./dashboardService');

    const error = await failure(getDashboard());

    expect(error).toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
