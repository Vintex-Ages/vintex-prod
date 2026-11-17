import { useId, useState } from 'react';
import { useNotifications } from '@/context/useNotifications';
import type { Notification } from '@/types/notification';
import { formatDateTime } from '@/utils/format';

type NewSaleNoticeProps = {
  /** Mostra a aba "Vendidas" do painel (o vendedor não tem tela de Pedido). */
  onShowSold: () => void;
};

/** Data legível, ou `null` se `createdAt` não for uma data válida. */
function readableDate(iso: string): string | null {
  return Number.isNaN(new Date(iso).getTime()) ? null : formatDateTime(iso);
}

function SaleNotice({
  item,
  pending,
  failed,
  onShowSold,
  onDismiss,
}: {
  item: Notification;
  pending: boolean;
  failed: boolean;
  onShowSold: () => void;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const date = readableDate(item.createdAt);

  return (
    <article
      aria-labelledby={titleId}
      className="flex items-start gap-3 bg-vermelho-escuro px-4 pb-4 pt-5 text-branco-quente shadow-sm"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-ui text-label font-bold uppercase text-vermelho-suave">
          Nova venda
          {date ? (
            <>
              {' • '}
              <time dateTime={item.createdAt}>{date}</time>
            </>
          ) : null}
        </p>
        <h2
          id={titleId}
          className="break-words font-display text-h4 [overflow-wrap:anywhere]"
        >{`Sua peça ${item.productName} foi vendida`}</h2>
        {/* RN-81: o prazo é simulado e conta da aprovação, o mesmo momento deste aviso. */}
        <p className="font-ui text-body-sm">
          Prazo de postagem (simulado): começa a contar na aprovação do pagamento, quando este aviso
          chegou. Prepare o envio da peça.
        </p>
        {failed ? (
          <p
            role="alert"
            className="mt-1 bg-branco-quente px-2 py-1 font-ui text-body-sm text-vermelho-escuro"
          >
            Não foi possível dispensar o aviso. Tente de novo.
          </p>
        ) : null}
        <button
          type="button"
          onClick={onShowSold}
          className="mt-2 inline-flex min-h-touch items-center justify-center self-start border border-linha bg-branco-quente px-3 font-ui text-label font-semibold uppercase text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-branco-quente focus-visible:ring-offset-2 focus-visible:ring-offset-vermelho-escuro"
        >
          Ver vendidas
        </button>
      </div>
      <button
        type="button"
        aria-label={`Dispensar aviso da venda de ${item.productName}`}
        disabled={pending}
        onClick={onDismiss}
        className="inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center font-ui text-h4 text-branco-quente transition-colors hover:bg-branco-quente/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-branco-quente disabled:cursor-wait disabled:opacity-50"
      >
        <span aria-hidden="true">×</span>
      </button>
    </article>
  );
}

/**
 * Avisos de nova venda no topo do painel do vendedor (FE-US036-3, #421): um
 * por notificação `sale` não lida do `useNotifications`, como o bloco "Nova
 * venda" do frame T15 ajustado (Figma 1001:1697).
 *
 * Onde o Figma e o back divergem, vale o back: o texto diz que a peça foi
 * vendida (sem "Pedido #…" nem validação do Pix), o `orderId` não aparece e o
 * botão leva à aba "Vendidas" do próprio painel. A data substitui o "agora"
 * do frame, que ficaria errado para um aviso antigo. O "1" do frame não entra:
 * cada aviso é uma venda.
 *
 * O "x" marca como lida pelo contexto: o aviso some e o contador do sino
 * acompanha. Se falhar, o aviso fica (a venda segue não lida) com o motivo e o
 * "x" liberado para tentar de novo. Sem venda não lida — ou com a rota de
 * notificações em erro — não renderiza nada.
 *
 * Usage:
 *   <NewSaleNotice onShowSold={() => setFilter('vendido')} />
 */
export default function NewSaleNotice({ onShowSold }: NewSaleNoticeProps) {
  const { available, items, markAsRead } = useNotifications();
  const [pending, setPending] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);

  const sales = available ? items.filter((item) => item.type === 'sale' && !item.isRead) : [];
  if (sales.length === 0) return null;

  async function dismiss(id: string) {
    setFailed((current) => current.filter((entry) => entry !== id));
    setPending((current) => [...current, id]);
    try {
      await markAsRead(id);
    } catch {
      setFailed((current) => [...current, id]);
    } finally {
      setPending((current) => current.filter((entry) => entry !== id));
    }
  }

  return (
    <section aria-label="Avisos de nova venda">
      <ul className="flex flex-col gap-3">
        {sales.map((item) => (
          <li key={item.id}>
            <SaleNotice
              item={item}
              pending={pending.includes(item.id)}
              failed={failed.includes(item.id)}
              onShowSold={onShowSold}
              onDismiss={() => void dismiss(item.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
