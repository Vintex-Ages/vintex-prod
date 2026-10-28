import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { getOrder, OrderError } from '@/services/orderService';
import type { Order } from '@/types/order';

export type OrderDetailState =
  | { status: 'loading' }
  | { status: 'ready'; order: Order }
  /** `notFound`: Pedido inexistente ou de outro usuário; tentar de novo não adianta. */
  | { status: 'error'; notFound: boolean };

/**
 * O que a tela pode oferecer para o pagamento, derivado da situação do Pedido.
 * `resend` = comprovante recusado (RN-23): a rejeição não é status, vem de
 * `payment.status`, e o Pedido volta a `aguardando_comprovante`.
 */
export type PaymentAction = 'send' | 'resend' | null;

export interface OrderDetailView {
  paymentAction: PaymentAction;
  /** Motivo da recusa, só quando há reenvio a fazer. */
  rejectionReason: string | null;
  expired: boolean;
}

/** Códigos de "não existe para você": o do mock e o 404 do envelope do back. */
const NOT_FOUND_CODES = new Set(['ORDER_NOT_FOUND', 'NOT_FOUND']);

/**
 * Regras de exibição do Pedido, fora do componente de apresentação. Só lê
 * `status` e `payment`, então serve ao detalhe (`Order`) e à lista
 * (`OrderSummary`, #321) sem a regra ser copiada.
 */
export function deriveOrderView(order: Pick<Order, 'status' | 'payment'>): OrderDetailView {
  const awaiting = order.status === 'aguardando_comprovante';
  const rejected = awaiting && order.payment?.status === 'rejeitado';

  return {
    paymentAction: awaiting ? (rejected ? 'resend' : 'send') : null,
    rejectionReason: rejected ? (order.payment?.rejectionReason ?? null) : null,
    expired: order.status === 'expirado',
  };
}

/**
 * Carrega o detalhe de um Pedido do comprador logado (FE-US023-2, #322) e o
 * relê quando a aba volta a ficar visível: a situação muda fora da tela (a
 * admin aprova, a simulação do back avança), e quem volta à aba espera ver o
 * estado de agora.
 *
 * - Primeira carga e `reload()` (o "Tentar de novo") passam por `loading`.
 * - A recarga da aba é em segundo plano: o Pedido continua na tela enquanto
 *   ela corre, e uma falha nela mantém o que já estava (o comprador não perde
 *   a tela por um soluço de rede). Só um "não encontrado" troca a tela.
 * - Resposta de consulta que ficou velha é descartada.
 *
 * O `userId` vem da sessão (`useAuth`), como nas outras telas que chamam
 * services por usuário; a rota já está atrás do `RequireAuth`.
 *
 * Usage:
 *   const { state, view, reload } = useOrderDetail(id);
 *   if (state.status === 'ready') <OrderStatusTimeline current={state.order.status} … />
 */
export function useOrderDetail(id: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<OrderDetailState>({ status: 'loading' });
  // Só a consulta mais recente pode escrever no estado.
  const latest = useRef(0);

  const load = useCallback(
    async (background: boolean) => {
      if (!userId || !id) return;
      const request = ++latest.current;
      if (!background) setState({ status: 'loading' });

      try {
        const order = await getOrder(userId, id);
        if (request === latest.current) setState({ status: 'ready', order });
      } catch (error) {
        if (request !== latest.current) return;
        const notFound = error instanceof OrderError && NOT_FOUND_CODES.has(error.code);
        // Em segundo plano, só "não existe mais" troca a tela; o resto mantém o Pedido.
        setState((current) =>
          background && current.status === 'ready' && !notFound
            ? current
            : { status: 'error', notFound },
        );
      }
    },
    [userId, id],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible') void load(true);
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [load]);

  const reload = useCallback(() => {
    void load(false);
  }, [load]);

  const view = state.status === 'ready' ? deriveOrderView(state.order) : null;

  return { state, view, reload };
}
