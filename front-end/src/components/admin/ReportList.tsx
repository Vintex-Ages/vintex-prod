import type { AdminOrderReport, OrderReportReason } from '@/types/report';
import { formatDateTime } from '@/utils/format';

/**
 * Lista de Reclamações da administradora (FE-US025-2, #427; RN-78). Só
 * apresentação e só leitura: nenhuma regra define resolver, responder ou
 * encerrar, então não há ação; e não há link para o Pedido, que é do
 * comprador (a administradora não abre pedido alheio).
 *
 * Cartões em vez da tabela da fila de comprovantes: a descrição é texto livre
 * e pode ser longa, o que não cabe numa célula. O visual (borda, fundo,
 * tipografia) segue o `ReceiptList`. A descrição vai como texto do React
 * (nunca HTML), com as quebras de linha do comprador e palavras longas
 * quebrando. A ordem vem pronta do service.
 *
 * Usage:
 *   import { ReportList } from '@/components/admin/ReportList';
 *   <ReportList items={reports} />
 */
type ReportListProps = {
  items: AdminOrderReport[];
};

const REASON_LABELS: Record<OrderReportReason, string> = {
  nao_recebido: 'Não recebido',
  danificado: 'Danificado',
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="font-ui text-label font-bold uppercase tracking-wide text-texto-auxiliar">
        {label}
      </dt>
      <dd className="truncate font-ui text-body-sm font-semibold text-tinta">{value}</dd>
    </div>
  );
}

export function ReportList({ items }: ReportListProps) {
  return (
    <ul aria-label="Reclamações" className="flex flex-col gap-4">
      {items.map((report) => (
        <li key={report.id}>
          <article className="flex flex-col gap-3 border border-linha bg-branco-quente p-4 tablet:p-5">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-ui text-body-sm font-bold text-tinta">
                  {`Pedido #${report.orderId}`}
                </h2>
                <span className="inline-flex items-center rounded-full border border-linha bg-papel-profundo px-2 py-0.5 font-ui text-label font-semibold uppercase text-tinta">
                  {REASON_LABELS[report.reason]}
                </span>
              </div>
              <time dateTime={report.createdAt} className="font-ui text-label text-texto-auxiliar">
                {formatDateTime(report.createdAt)}
              </time>
            </header>

            <p className="whitespace-pre-line break-words font-ui text-body text-tinta">
              {report.description}
            </p>

            <dl className="grid gap-3 border-t border-linha pt-3 tablet:grid-cols-2">
              <Detail label="Comprador" value={report.buyer.name} />
              <Detail label="Loja" value={report.store.name} />
            </dl>
          </article>
        </li>
      ))}
    </ul>
  );
}
