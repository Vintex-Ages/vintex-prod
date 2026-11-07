import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { deriveOrderView, type PaymentAction } from '@/hooks/useOrderDetail';
import { listMyOrders } from '@/services/orderService';
import type { OrderSummary } from '@/types/order';

export type MyOrdersState =
  | { status: 'loading' }
  | { status: 'error' }
  /** `page` é a última página carregada; `total`, o total do comprador no back. */
  | { status: 'ready'; orders: OrderSummary[]; page: number; total: number };

export interface MyOrderEntry {
  order: OrderSummary;
  /** Ação de pagamento do cartão, pela mesma regra do detalhe (`deriveOrderView`). */
  paymentAction: PaymentAction;
}

/**
 * Lista "Meus pedidos" do comprador logado (FE-US023-1, #321): primeira
 * página, "carregar mais" e a ação de pagamento de cada Pedido. A tela só
 * desenha.
 *
 * - A ordem é a do service (mais recente primeiro, contrato do back-end#248);
 *   o hook não reordena.
 * - `loadMore()` acrescenta a próxima página. Falha nela não apaga a lista:
 *   vira `loadMoreError` e o botão continua lá para tentar de novo.
 * - `retry()` recomeça da primeira página, passando por `loading`.
 * - Resposta de consulta que ficou velha é descartada.
 *
 * O `userId` vem da sessão (`useAuth`), como no `useOrderDetail`; a rota já
 * está atrás do `RequireAuth`.
 *
 * Usage:
 *   const { state, entries, hasMore, loadMore, retry } = useMyOrders();
 *   entries.map(({ order, paymentAction }) => <OrderCard key={order.id} order={order} … />)
 */
export function useMyOrders() {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<MyOrdersState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  // Só a consulta mais recente escreve; `busy` trava cliques repetidos antes do render.
  const latest = useRef(0);
  const busy = useRef(false);

  const loadFirstPage = useCallback(async () => {
    if (!userId) return;
    const request = ++latest.current;
    busy.current = false;
    setState({ status: 'loading' });
    setLoadingMore(false);
    setLoadMoreError(false);

    try {
      const { items, page, total } = await listMyOrders(userId, 1);
      if (request === latest.current) setState({ status: 'ready', orders: items, page, total });
    } catch {
      if (request === latest.current) setState({ status: 'error' });
    }
  }, [userId]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const hasMore = state.status === 'ready' && state.orders.length < state.total;

  const loadMore = useCallback(async () => {
    if (!userId || state.status !== 'ready' || !hasMore || busy.current) return;
    busy.current = true;
    const request = latest.current;
    setLoadingMore(true);
    setLoadMoreError(false);

    try {
      const next = await listMyOrders(userId, state.page + 1);
      if (request !== latest.current) return;
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              orders: [...current.orders, ...next.items],
              page: next.page,
              total: next.total,
            }
          : current,
      );
    } catch {
      if (request === latest.current) setLoadMoreError(true);
    } finally {
      if (request === latest.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, [userId, state, hasMore]);

  const retry = useCallback(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const entries: MyOrderEntry[] =
    state.status === 'ready'
      ? state.orders.map((order) => ({
          order,
          paymentAction: deriveOrderView(order).paymentAction,
        }))
      : [];

  return { state, entries, hasMore, loadingMore, loadMoreError, loadMore, retry };
}
