import clsx from 'clsx';
import Button from '@/components/common/Button';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import type { OrderStatus, OrderSummary } from '@/types/order';
import { formatCentsToBRL, formatPieceCount } from '@/utils/format';

/**
 * Cartão de um Pedido em "Meus pedidos" (FE-CMP-36, issue #307; Figma Meus
 * pedidos T11, node 1001:1421): número, data, miniatura e nome da 1ª peça
 * ("+N peças" se houver mais), loja, total e badge da situação. Só
 * apresentação: o cartão inteiro chama `onOpen` com o id (quem navega é a
 * página) e `action` aparece só se a página mandar.
 *
 * Link esticado como no `StoreCard`: o botão principal cobre o cartão com
 * `::after`, e o botão de `action` fica acima dele (`relative z-10`), irmão e
 * não filho, então nenhum interativo fica dentro de outro e o clique na ação
 * não abre o detalhe.
 *
 * Comprovante recusado não é status do Pedido (RN-23): vem de
 * `payment.status` e, quando presente, ocupa o lugar do badge do status.
 * Exceção: Pedido `expirado` mostra "Expirado" mesmo com a recusa, porque a
 * recusa ficou para trás e o que vale agora é que o Pedido acabou (#321).
 * Sem prazo nem rastreio de transportadora (RN-83). "Avaliar loja" e
 * "Reportar problema" ficam para a Sprint 4.
 *
 * Usage:
 *   import OrderCard from '@/components/orders/OrderCard';
 *   <OrderCard
 *     order={pedido}
 *     onOpen={(id) => navigate(orderDetail(id))}
 *     action={{ label: 'Enviar comprovante', onClick: () => abrirEnvio(pedido.id) }}
 *   />
 */
export type OrderCardProps = {
  order: OrderSummary;
  onOpen: (id: string) => void;
  /** Botão separado (ex.: "Enviar comprovante"); a página decide quando passar. */
  action?: { label: string; onClick: () => void };
};

type BadgeTone = 'attention' | 'success' | 'danger';

const STATUS_BADGES: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  aguardando_comprovante: { label: 'Aguardando comprovante', tone: 'attention' },
  em_analise: { label: 'Comprovante em análise', tone: 'attention' },
  confirmado: { label: 'Pagamento confirmado', tone: 'success' },
  preparando: { label: 'Preparando', tone: 'success' },
  enviado: { label: 'Enviado', tone: 'success' },
  concluido: { label: 'Concluído', tone: 'success' },
  expirado: { label: 'Expirado', tone: 'danger' },
};

const REJECTED_BADGE = { label: 'Comprovante recusado', tone: 'danger' as const };

// Fuso fixo: a data exibida não depende da máquina de quem abre a tela.
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** "dd/mm/aaaa", ou `null` se `iso` não for data válida. */
function formatDate(iso: string): string | null {
  const date = new Date(iso);
  // `format` lança RangeError com Invalid Date; aqui a data só some.
  if (Number.isNaN(date.getTime())) return null;

  const parts = Object.fromEntries(
    dateFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year}`;
}

function OrderBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-label font-semibold uppercase',
        tone === 'attention' && 'bg-dourado text-tinta',
        tone === 'success' && 'bg-verde-rs text-branco-quente',
        tone === 'danger' && 'bg-vermelho-escuro text-branco-quente',
      )}
    >
      {label}
    </span>
  );
}

function OrderCard({ order, onOpen, action }: OrderCardProps) {
  const [first] = order.items;
  const extraCount = order.items.length - 1;
  const createdAt = formatDate(order.createdAt);
  // `expirado` vence a recusa; fora isso, a recusa vence o badge do status.
  const badge =
    order.status !== 'expirado' && order.payment?.status === 'rejeitado'
      ? REJECTED_BADGE
      : STATUS_BADGES[order.status];

  return (
    <article className="relative flex flex-col gap-3 border border-linha bg-branco-quente p-4 transition-colors hover:border-texto-auxiliar">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate text-body-sm font-semibold text-tinta">
          {/* Link esticado: o cartão todo é clicável, como no `StoreCard`. */}
          <button
            type="button"
            onClick={() => onOpen(order.id)}
            className="text-left after:absolute after:inset-0 after:content-[''] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-tinta"
          >
            {`Pedido #${order.id}`}
          </button>
        </h3>
        {createdAt ? (
          <time dateTime={order.createdAt} className="shrink-0 text-label text-texto-auxiliar">
            {createdAt}
          </time>
        ) : null}
      </header>

      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden bg-papel-profundo tablet:h-20 tablet:w-20">
          {first?.coverImageUrl ? (
            <img
              src={first.coverImageUrl}
              alt={first.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <ProductImagePlaceholder productName={first?.name ?? 'Peça'} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {first ? (
            <p className="truncate text-body-sm font-semibold text-tinta">{first.name}</p>
          ) : null}
          {extraCount > 0 ? (
            <p className="text-label text-texto-auxiliar">{`+${formatPieceCount(extraCount)}`}</p>
          ) : null}
          <p className="truncate text-label text-texto-auxiliar">{order.store.name}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-linha pt-3">
        <OrderBadge label={badge.label} tone={badge.tone} />
        {/* `totalAmount` vem em reais; o formatador do repo recebe centavos. */}
        <p className="text-body font-bold text-tinta">
          {formatCentsToBRL(Math.round(order.totalAmount * 100))}
        </p>
      </div>

      {action ? (
        <Button
          variant="primary"
          onClick={action.onClick}
          className="relative z-10 w-full tablet:w-auto tablet:self-end"
        >
          {action.label}
        </Button>
      ) : null}
    </article>
  );
}

export default OrderCard;
