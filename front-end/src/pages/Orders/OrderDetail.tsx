import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '@/components/common/Button';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import OrderStatusTimeline from '@/components/orders/OrderStatusTimeline';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { orderPaymentPath, paths, productDetail, storeProfile } from '@/routes/paths';
import type { Order, PaymentStatus } from '@/types/order';
import { formatCentsToBRL } from '@/utils/format';

/**
 * Detalhe do Pedido do comprador (FE-US023-2, #322; VS-023), em
 * `/profile/orders/:id`, atrás do `RequireAuth`.
 *
 * Mostra a linha do tempo (`OrderStatusTimeline` com `status` e `history`, que
 * o back avança por simulação depois de confirmado), a loja, as peças, o
 * endereço de entrega, o total e o nome e a situação do comprovante — nunca o
 * arquivo. Comprovante recusado traz o motivo e "Reenviar comprovante" (RN-23);
 * aguardando comprovante traz "Enviar comprovante" e o prazo (`expiresAt`);
 * expirado não oferece pagamento.
 *
 * Fica de fora, de propósito: a chave Pix da loja (é da tela de pagamento) e a
 * comissão (`platformFee`, é do vendedor); rastreio (RN-83); "Avaliar loja" e
 * "Reportar problema" (Sprint 4).
 *
 * Só apresentação: carga, recarga ao voltar à aba e o que oferecer para o
 * pagamento vêm do `useOrderDetail`.
 *
 * Usage:
 *   <Route
 *     path={paths.orderDetail}
 *     element={<RequireAuth><OrderDetail /></RequireAuth>}
 *   />
 */

// Fuso fixo: a data exibida não depende da máquina de quem abre a tela.
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "dd/mm/aaaa hh:mm" (ou só "dd/mm/aaaa"), ou `null` se `iso` não for data válida. */
function formatDate(iso: string, withTime = true): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(
    dateFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const day = `${parts.day}/${parts.month}/${parts.year}`;
  return withTime ? `${day} ${parts.hour}:${parts.minute}` : day;
}

function formatReais(value: number): string {
  // `formatCentsToBRL` recebe centavos; os valores do Pedido vêm em reais.
  return formatCentsToBRL(Math.round(value * 100));
}

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pendente: 'Em análise',
  aprovado: 'Aprovado',
  rejeitado: 'Recusado',
};

const INLINE_LINK =
  'text-tinta underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const titleId = `pedido-${id}`;
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 border border-linha bg-branco-quente p-4 tablet:p-6"
    >
      <h2 id={titleId} className="font-display text-h4 text-tinta">
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-linha py-2 last:border-b-0 tablet:flex-row tablet:justify-between tablet:gap-4">
      <dt className="text-body-sm text-texto-auxiliar">{label}</dt>
      <dd className="text-body text-tinta tablet:text-right">{children}</dd>
    </div>
  );
}

function ItemsSection({ order }: { order: Order }) {
  return (
    <Section id="pecas" title="Peças">
      <p className="text-body-sm text-texto-auxiliar">
        Loja{' '}
        <Link to={storeProfile(order.store.id)} className={`font-semibold ${INLINE_LINK}`}>
          {order.store.name}
        </Link>
      </p>
      <ul className="flex flex-col gap-3">
        {order.items.map((item) => (
          <li key={item.productId} className="flex items-center gap-3">
            {/* Decorativa: o nome da peça, logo ao lado, é o link. */}
            <div
              aria-hidden="true"
              className="h-16 w-16 shrink-0 overflow-hidden bg-papel-profundo"
            >
              {item.coverImageUrl ? (
                <img src={item.coverImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ProductImagePlaceholder productName={item.name} />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 tablet:flex-row tablet:items-center tablet:justify-between">
              <Link
                to={productDetail(item.productId)}
                className={`truncate text-body-sm font-semibold ${INLINE_LINK}`}
              >
                {item.name}
              </Link>
              <span className="text-body-sm text-texto-auxiliar">{formatReais(item.price)}</span>
            </div>
          </li>
        ))}
      </ul>
      <dl className="border-t border-linha pt-2">
        <InfoRow label="Total">
          <strong className="font-bold">{formatReais(order.totalAmount)}</strong>
        </InfoRow>
      </dl>
    </Section>
  );
}

function AddressSection({ order }: { order: Order }) {
  const address = order.deliveryAddress;
  return (
    <Section id="endereco" title="Endereço de entrega">
      <dl>
        <InfoRow label="Endereço">
          {`${address.street}, ${address.number}`}
          {address.complement ? ` – ${address.complement}` : null}
        </InfoRow>
        <InfoRow label="Bairro">{address.neighborhood}</InfoRow>
        <InfoRow label="Cidade">{`${address.city}/${address.state}`}</InfoRow>
        <InfoRow label="CEP">{address.zipCode}</InfoRow>
      </dl>
    </Section>
  );
}

function ReceiptSection({ order }: { order: Order }) {
  const { payment } = order;
  return (
    <Section id="comprovante" title="Comprovante">
      {payment ? (
        <dl>
          {/* Só o nome: o comprador nunca recebe o arquivo de volta. */}
          <InfoRow label="Arquivo enviado">{payment.receiptName ?? 'Comprovante enviado'}</InfoRow>
          <InfoRow label="Situação">{PAYMENT_STATUS_LABEL[payment.status]}</InfoRow>
        </dl>
      ) : (
        <p className="text-body text-texto-auxiliar">Nenhum comprovante enviado ainda.</p>
      )}
    </Section>
  );
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state, view, reload } = useOrderDetail(id);

  function content() {
    if (state.status === 'loading') {
      return (
        <p role="status" className="py-10 text-body text-texto-auxiliar">
          Carregando o pedido...
        </p>
      );
    }

    if (state.status === 'error') {
      return state.notFound ? (
        <ErrorState
          title="Pedido não encontrado"
          message="Este pedido não existe ou não pertence à sua conta."
        />
      ) : (
        <ErrorState message="Não foi possível carregar o pedido." onRetry={reload} />
      );
    }

    const { order } = state;
    const createdAt = formatDate(order.createdAt, false);
    const deadline = formatDate(order.expiresAt);
    const goToPayment = () => navigate(orderPaymentPath(order.id));

    return (
      <>
        <p className="text-body text-texto-auxiliar">
          {`Pedido #${order.id}`}
          {createdAt ? ` · feito em ${createdAt}` : null}
        </p>

        {view?.paymentAction === 'resend' ? (
          <div className="flex flex-col gap-3 border border-vermelho-escuro bg-vermelho-suave p-4 tablet:flex-row tablet:items-center tablet:justify-between">
            <div className="flex flex-col gap-1">
              <p className="text-body font-semibold text-vermelho-escuro">Comprovante recusado</p>
              <p className="text-body-sm text-tinta">
                Motivo: <span>{view.rejectionReason ?? 'não informado.'}</span>
              </p>
            </div>
            <Button onClick={goToPayment}>Reenviar comprovante</Button>
          </div>
        ) : null}

        {view?.paymentAction === 'send' ? (
          <div className="flex flex-col gap-3 border border-dourado bg-papel-profundo p-4 tablet:flex-row tablet:items-center tablet:justify-between">
            <p className="text-body text-tinta">
              Envie o comprovante do Pix
              {deadline ? (
                <>
                  {' até '}
                  <time dateTime={order.expiresAt} className="font-semibold">
                    {deadline}
                  </time>
                </>
              ) : null}
              . Sem comprovante aprovado no prazo, o pedido expira.
            </p>
            <Button onClick={goToPayment}>Enviar comprovante</Button>
          </div>
        ) : null}

        {/* "Pedido expirado" já vem da linha do tempo; aqui só o que mudou. */}
        {view?.expired ? (
          <p className="border border-linha bg-papel-profundo p-4 text-body text-tinta">
            O prazo para enviar o comprovante acabou e as peças voltaram a ficar disponíveis na
            loja.
          </p>
        ) : null}

        <div className="grid gap-6 web:grid-cols-3">
          <Section id="andamento" title="Andamento do pedido">
            <OrderStatusTimeline current={order.status} history={order.history} />
          </Section>

          <div className="flex flex-col gap-6 web:col-span-2">
            <ItemsSection order={order} />
            <AddressSection order={order} />
            <ReceiptSection order={order} />
          </div>
        </div>
      </>
    );
  }

  return (
    <Container as="main" className="flex flex-col gap-6 py-6 tablet:py-10">
      <Link to={paths.orders} className={`self-start text-body-sm ${INLINE_LINK}`}>
        <span aria-hidden="true">← </span>
        Voltar para Meus pedidos
      </Link>
      <h1 className="font-display text-h2 text-tinta">Detalhe do pedido</h1>
      {content()}
    </Container>
  );
}
