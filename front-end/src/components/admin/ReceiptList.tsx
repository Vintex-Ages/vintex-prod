import Button from '@/components/common/Button';
import type { ReceiptReview } from '@/types/admin';
import { PaymentStatusBadge } from './PaymentStatusBadge';

/**
 * Fila de comprovantes (FE-US032-1): tabela a partir do tablet e cartões no
 * celular — o mesmo `<table>` muda de aparência por CSS, então há um só
 * conjunto de botões "Ver comprovante" no DOM. Só apresentação: a ordem e o
 * filtro vêm prontos do service; abrir o detalhe é `onViewReceipt`.
 *
 * Usage:
 *   import { ReceiptList } from '@/components/admin/ReceiptList';
 *   <ReceiptList items={items} onViewReceipt={(item) => setSelected(item)} />
 */
type ReceiptListProps = {
  items: ReceiptReview[];
  onViewReceipt: (item: ReceiptReview) => void;
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const headClass =
  'px-4 py-3 text-left font-ui text-label font-bold uppercase tracking-wide text-texto-auxiliar';
const cellClass = 'flex items-start justify-between gap-4 px-4 py-2 tablet:table-cell tablet:py-4';

/** Rótulo do campo, só no celular (no tablet o cabeçalho da tabela assume). */
function MobileLabel({ children }: { children: string }) {
  return (
    <span className="font-ui text-label font-bold uppercase text-texto-auxiliar tablet:hidden">
      {children}
    </span>
  );
}

export function ReceiptList({ items, onViewReceipt }: ReceiptListProps) {
  return (
    <table className="block w-full border-collapse tablet:table">
      <caption className="sr-only">Comprovantes de pagamento</caption>
      <thead className="hidden tablet:table-header-group">
        <tr className="border border-linha bg-papel-profundo">
          <th scope="col" className={headClass}>
            Pedido
          </th>
          <th scope="col" className={headClass}>
            Comprador
          </th>
          <th scope="col" className={headClass}>
            Loja
          </th>
          <th scope="col" className={headClass}>
            Valor
          </th>
          <th scope="col" className={headClass}>
            Status
          </th>
          <th scope="col" className={headClass}>
            <span className="sr-only">Ações</span>
          </th>
        </tr>
      </thead>
      <tbody className="flex flex-col gap-3 tablet:table-row-group">
        {items.map((item) => {
          const contact = item.buyer.email || item.buyer.phone;
          return (
            <tr
              key={item.orderId}
              className="block border border-linha bg-branco-quente py-2 tablet:table-row tablet:py-0"
            >
              <td className={cellClass}>
                <MobileLabel>Pedido</MobileLabel>
                <span className="font-ui text-body font-semibold text-tinta">#{item.orderId}</span>
              </td>
              <td className={cellClass}>
                <MobileLabel>Comprador</MobileLabel>
                <span className="flex flex-col text-right tablet:text-left">
                  <span className="font-ui text-body text-tinta">{item.buyer.name}</span>
                  {contact ? (
                    <span className="font-ui text-body-sm text-texto-auxiliar">{contact}</span>
                  ) : null}
                </span>
              </td>
              <td className={cellClass}>
                <MobileLabel>Loja</MobileLabel>
                <span className="font-ui text-body text-tinta">{item.store.name}</span>
              </td>
              <td className={cellClass}>
                <MobileLabel>Valor</MobileLabel>
                <span className="font-ui text-body text-tinta">
                  {currency.format(item.totalAmount)}
                </span>
              </td>
              <td className={cellClass}>
                <MobileLabel>Status</MobileLabel>
                <PaymentStatusBadge status={item.payment.status} />
              </td>
              <td className="block px-4 py-2 tablet:table-cell tablet:py-4 tablet:text-right">
                <Button
                  variant="outline"
                  onClick={() => onViewReceipt(item)}
                  aria-label={`Ver comprovante do pedido #${item.orderId}`}
                  className="w-full tablet:w-auto"
                >
                  Ver comprovante
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
