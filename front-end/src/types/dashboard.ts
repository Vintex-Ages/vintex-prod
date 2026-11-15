/**
 * Contratos do painel geral da administradora (FE-SVC-admin-dashboard,
 * issue #431).
 *
 * Números gerais da plataforma. Dinheiro em reais (não centavos), como os
 * demais services.
 */

/** Vendas de uma loja: a soma dos Pedidos confirmados dela. */
export interface StoreSales {
  storeId: string;
  storeName: string;
  amount: number;
}

export interface AdminDashboard {
  storesCount: number;
  usersCount: number;
  /** Peças Anunciadas (valor `ativo` no back). */
  activeProductsCount: number;
  /** Soma do valor dos Pedidos confirmados. */
  salesVolume: number;
  /** Comissão acumulada: 9% sobre `salesVolume` (RN-11). */
  commissionTotal: number;
  salesByStore: StoreSales[];
}
