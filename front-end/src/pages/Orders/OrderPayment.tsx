import { useEffect, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '@/components/common/Button';
import ErrorState from '@/components/common/ErrorState';
import MediaUploader from '@/components/common/MediaUploader';
import PixPaymentCard from '@/components/checkout/PixPaymentCard';
import Container from '@/components/layout/Container';
import { useToast } from '@/context/useToast';
import { useOrderPayment } from '@/hooks/useOrderPayment';
import { orderDetailPath, paths } from '@/routes/paths';
import type { Order } from '@/types/order';

/**
 * Pagamento do Pedido, etapa 2 de 2 (FE-US022-2, #320; VS-022), em
 * `/profile/orders/:id/payment`, atrás do `RequireAuth`.
 *
 * Por Pedido: mostra o valor exato e a chave Pix do brechó (`PixPaymentCard`)
 * e recebe o comprovante — imagem ou PDF — pelo `MediaUploader`. Enviar põe o
 * Pedido em análise (é o back que muda o estado, RN-82) e leva ao detalhe.
 *
 * A mesma tela serve o reenvio: comprovante recusado mostra o motivo no topo
 * e pede outro arquivo (RN-23). Quem chegou aqui ao confirmar o checkout e
 * fechou a aba antes de pagar volta pela ação de "Meus pedidos", que abre esta
 * rota direto.
 *
 * Para não pagar duas vezes, um Pedido que já saiu de `aguardando_comprovante`
 * é mandado ao detalhe; um Pedido `expirado` (back-end#280) explica que o
 * prazo acabou e que as peças voltaram para a loja, sem oferecer envio.
 *
 * Fica de fora, de propósito, o que a issue veta: texto de custódia/garantia,
 * "Instituição: Banrisul", "liberação imediata" e QR Code (o Pix é a chave do
 * vendedor e a conferência é manual, RN-13/RN-14/RN-21).
 *
 * Só apresentação: carga, situação do Pedido e envio vêm do `useOrderPayment`.
 *
 * Usage:
 *   <Route
 *     path={paths.orderPayment}
 *     element={<RequireAuth><OrderPayment /></RequireAuth>}
 *   />
 */

// Fuso fixo: o prazo exibido não depende da máquina de quem abre a tela.
const deadlineFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "dd/mm/aaaa hh:mm", ou `null` se `iso` não for data válida. */
function formatDeadline(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(
    deadlineFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

const INLINE_LINK =
  'text-tinta underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro';

/** Prazo do comprovante, também mostrado no detalhe (`OrderDetail`). */
function Deadline({ order }: { order: Order }) {
  const deadline = formatDeadline(order.expiresAt);

  return (
    <p className="font-ui text-body-sm text-texto-auxiliar">
      Envie o comprovante
      {deadline ? (
        <>
          {' até '}
          <time dateTime={order.expiresAt} className="font-semibold text-tinta">
            {deadline}
          </time>
        </>
      ) : null}
      . Sem comprovante aprovado no prazo, o pedido expira e as peças voltam para a loja.
    </p>
  );
}

/** Aviso de recusa (RN-23), no topo da tela, com o motivo que a admin escreveu. */
function RejectionNotice({ reason }: { reason: string | null }) {
  return (
    <section
      role="alert"
      aria-labelledby="comprovante-recusado"
      className="flex flex-col gap-2 border border-vermelho-escuro bg-vermelho-suave p-4"
    >
      <h2
        id="comprovante-recusado"
        className="font-ui text-body font-semibold text-vermelho-escuro"
      >
        Comprovante recusado
      </h2>
      <p className="font-ui text-body-sm text-tinta">
        Motivo: <span>{reason ?? 'não informado.'}</span>
      </p>
      <p className="font-ui text-body font-semibold text-tinta">Envie outro comprovante.</p>
    </section>
  );
}

/** Saída do Pedido que venceu sem comprovante: as peças já voltaram à loja. */
function ExpiredNotice({ order }: { order: Order }) {
  return (
    <section
      aria-labelledby="pedido-expirado"
      className="flex flex-col gap-3 border border-linha bg-papel-profundo p-4 tablet:p-6"
    >
      <h2 id="pedido-expirado" className="font-display text-h4 text-tinta">
        Pedido expirado
      </h2>
      <p className="font-ui text-body text-tinta">
        O prazo para enviar o comprovante acabou e as peças voltaram a ficar disponíveis na loja.
        Este pedido não pode mais ser pago.
      </p>
      <Link
        to={orderDetailPath(order.id)}
        className={`self-start text-body-sm font-semibold ${INLINE_LINK}`}
      >
        Ver detalhe do pedido
      </Link>
    </section>
  );
}

export default function OrderPayment() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const payment = useOrderPayment(id);
  const { state, stage } = payment;

  // Pedido que já passou de `aguardando_comprovante`: nada de pagar de novo.
  const closedId = state.status === 'ready' && stage?.kind === 'closed' ? state.order.id : null;

  useEffect(() => {
    if (closedId) navigate(orderDetailPath(closedId), { replace: true });
  }, [closedId, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!id) return;

    const result = await payment.send();

    if (result === 'sent') {
      toast('Comprovante enviado para análise', { kind: 'success' });
      navigate(orderDetailPath(id), { replace: true });
    } else if (result === 'closed') {
      toast('Este pedido não está mais aguardando comprovante.', { kind: 'info' });
      navigate(orderDetailPath(id), { replace: true });
    }
  }

  function content() {
    if (state.status === 'loading') {
      return (
        <p role="status" className="py-10 font-ui text-body text-texto-auxiliar">
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
        <ErrorState message="Não foi possível carregar o pedido." onRetry={payment.reload} />
      );
    }

    const { order } = state;
    if (!stage) return null;

    if (stage.kind === 'expired') return <ExpiredNotice order={order} />;

    if (stage.kind === 'closed') {
      return (
        <p role="status" className="py-10 font-ui text-body text-texto-auxiliar">
          Este pedido já saiu da etapa de pagamento. Abrindo o detalhe...
        </p>
      );
    }

    return (
      <>
        {stage.rejected ? <RejectionNotice reason={stage.rejectionReason} /> : null}

        <p className="font-ui text-body text-texto-auxiliar">
          Pague o valor exato com Pix para a chave do brechó e envie o comprovante.
        </p>

        <PixPaymentCard
          amount={order.totalAmount}
          pixKey={order.store.pixKey}
          storeName={order.store.name}
          orderLabel={`Pedido #${order.id}`}
          onCopied={() => toast('Chave Pix copiada', { kind: 'success' })}
        />

        <Deadline order={order} />

        <form
          onSubmit={handleSubmit}
          noValidate
          aria-labelledby="comprovante-titulo"
          className="flex flex-col gap-4 border border-linha bg-branco-quente p-4 tablet:p-6"
        >
          <h2 id="comprovante-titulo" className="font-display text-h4 text-tinta">
            Comprovante
          </h2>

          <MediaUploader
            id="comprovante"
            label="Comprovante do Pix"
            value={payment.receipt}
            onChange={payment.setReceipt}
            accept="image/png,image/jpeg,application/pdf"
            maxSizeMb={8}
            single
            disabled={payment.submitting}
            helperText="Imagem (PNG ou JPEG) ou PDF, até 8 MB."
            error={payment.fileError ?? undefined}
          />

          {payment.submitError ? (
            <p
              role="alert"
              className="border border-vermelho-escuro bg-vermelho-suave p-3 font-ui text-body text-vermelho-escuro"
            >
              {payment.submitError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 tablet:flex-row tablet:justify-end">
            <Button type="submit" disabled={payment.submitting}>
              {payment.submitting
                ? 'Enviando comprovante…'
                : stage.rejected
                  ? 'Reenviar comprovante'
                  : 'Enviar comprovante'}
            </Button>
          </div>
        </form>
      </>
    );
  }

  return (
    <Container as="main" width="narrow" className="flex flex-col gap-6 py-6 tablet:py-10">
      <Link to={paths.orders} className={`self-start text-body-sm ${INLINE_LINK}`}>
        <span aria-hidden="true">← </span>
        Voltar para Meus pedidos
      </Link>

      <div className="flex flex-col gap-1">
        <p className="font-ui text-label font-semibold uppercase tracking-wide text-texto-auxiliar">
          Etapa 2 de 2
        </p>
        <h1 className="font-display text-h2 text-tinta">Pagamento do pedido</h1>
      </div>

      {content()}
    </Container>
  );
}
