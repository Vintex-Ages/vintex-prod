import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import OrderCard from '@/components/orders/OrderCard';
import { OrderCardSkeleton } from '@/components/orders/OrderCardSkeleton';
import ReportProblemDialog from '@/components/orders/ReportProblemDialog';
import { useMyOrders } from '@/hooks/useMyOrders';
import type { PaymentAction } from '@/hooks/useOrderDetail';
import { orderDetailPath, orderPaymentPath, paths } from '@/routes/paths';
import { canReportOrder } from '@/services/reportService';

/**
 * "Meus pedidos" (FE-US023-1, #321; VS-023 "Lista consolidada"), em
 * `/profile/orders`, atrás do `RequireAuth`. Entrada pelo menu da conta do
 * `Header` ("Meus pedidos").
 *
 * Todos os Pedidos do comprador, na ordem do service (mais recente primeiro),
 * cada um num `OrderCard`: o cartão abre o detalhe, e a ação de pagamento
 * ("Enviar comprovante" / "Reenviar comprovante") vai à tela de pagamento sem
 * abrir o detalhe. Expirado e os demais status não têm ação. Skeleton ao
 * carregar, `ErrorState` com retry, `EmptyState` sem pedidos e "Carregar
 * mais" enquanto houver.
 *
 * "Reportar problema" (#410) vai no `afterSaleActions.secondary` do cartão
 * quando `canReportOrder` deixa (confirmado em diante, RN-77) e abre o
 * `ReportProblemDialog` sem sair da lista.
 *
 * Fica de fora: rastreio e "tempo médio" (RN-83/RN-21) e "Avaliar loja"
 * (issue própria).
 *
 * Só apresentação: carga, paginação e qual ação cada Pedido tem vêm do
 * `useMyOrders`.
 *
 * Usage:
 *   <Route path={paths.orders} element={<RequireAuth><Orders /></RequireAuth>} />
 */

const ACTION_LABEL: Record<Exclude<PaymentAction, null>, string> = {
  send: 'Enviar comprovante',
  resend: 'Reenviar comprovante',
};

export default function Orders() {
  const navigate = useNavigate();
  const { state, entries, hasMore, loadingMore, loadMoreError, loadMore, retry } = useMyOrders();
  const [reportingId, setReportingId] = useState<string | null>(null);

  function content() {
    if (state.status === 'loading') return <OrderCardSkeleton />;

    if (state.status === 'error') {
      return <ErrorState message="Não foi possível carregar seus pedidos." onRetry={retry} />;
    }

    if (entries.length === 0) {
      return (
        <EmptyState
          title="Você ainda não fez nenhum pedido"
          message="Quando você comprar uma peça, o pedido aparece aqui com a situação de cada etapa."
          action={<Button onClick={() => navigate(paths.catalog)}>Explorar o catálogo</Button>}
        />
      );
    }

    return (
      <>
        {/* `h2` invisível: os cartões têm `h3`, e a página não pula de nível. */}
        <h2 id="lista-pedidos" className="sr-only">
          Pedidos
        </h2>
        <ul aria-labelledby="lista-pedidos" className="flex flex-col gap-4">
          {entries.map(({ order, paymentAction }) => (
            <li key={order.id}>
              <OrderCard
                order={order}
                onOpen={(id) => navigate(orderDetailPath(id))}
                action={
                  paymentAction
                    ? {
                        label: ACTION_LABEL[paymentAction],
                        onClick: () => navigate(orderPaymentPath(order.id)),
                      }
                    : undefined
                }
                afterSaleActions={
                  canReportOrder(order.status)
                    ? {
                        secondary: {
                          label: 'Reportar problema',
                          onClick: () => setReportingId(order.id),
                        },
                      }
                    : undefined
                }
              />
            </li>
          ))}
        </ul>

        {/* `key`: cada Pedido abre o formulário vazio. */}
        {reportingId ? (
          <ReportProblemDialog
            key={reportingId}
            open
            orderId={reportingId}
            onClose={() => setReportingId(null)}
          />
        ) : null}

        {loadMoreError ? (
          <p role="alert" className="text-body-sm text-vermelho-escuro">
            Não foi possível carregar mais pedidos. Tente de novo.
          </p>
        ) : null}

        {hasMore ? (
          <Button
            variant="outline"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="self-center"
          >
            {loadingMore ? 'Carregando...' : 'Carregar mais'}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <Container as="main" className="flex flex-col gap-6 py-6 tablet:py-10">
      <h1 className="font-display text-h2 text-tinta">Meus pedidos</h1>
      {content()}
    </Container>
  );
}
