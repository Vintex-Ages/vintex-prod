import Button from '@/components/common/Button';
import type { ReceiptReview } from '@/types/admin';
import { PaymentStatusBadge } from './PaymentStatusBadge';

/**
 * Fila de comprovantes (FE-US032-1): tabela a partir do tablet e cartões no
 * celular, como no Figma — o mesmo `<table>` muda de aparência por CSS, então
 * há um só conjunto de botões "Ver comprovante" no DOM. No celular cada linha
 * vira um grid (Pedido + status, peça, comprador, vendedor, valor) e o cartão
 * inteiro é o clique: o botão fica invisível por cima dele (como no Figma, sem
 * botão no cartão) e só aparece a partir do tablet. Os textos marcados
 * `tablet:hidden` só existem nos cartões. A ordem das células no DOM é a das
 * colunas da tabela; no cartão o `order-*` rearruma. Só apresentação: a
 * ordem e o filtro vêm prontos do service; abrir o detalhe é `onViewReceipt`.
 *
 * Usage:
 *   import { ReceiptList } from '@/components/admin/ReceiptList';
 *   <ReceiptList items={items} onViewReceipt={(item) => setSelected(item)} />
 */
type ReceiptListProps = {
  items: ReceiptReview[];
  onViewReceipt: (item: ReceiptReview) => void;
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const headClass =
  'px-5 py-3 text-left font-ui text-label font-bold uppercase tracking-wide text-texto-auxiliar';
const cellClass = 'tablet:table-cell tablet:px-5 tablet:py-4 tablet:align-middle';

/** "+2 peças": quantas peças vêm junto com a primeira. */
function extraItemsLabel(count: number): string | null {
  if (count <= 0) return null;
  return `+${count} ${count === 1 ? 'peça' : 'peças'}`;
}

export function ReceiptList({ items, onViewReceipt }: ReceiptListProps) {
  return (
    <table className="block w-full border-collapse tablet:table tablet:border tablet:border-linha tablet:bg-branco-quente">
      <caption className="sr-only">Comprovantes de pagamento</caption>
      <thead className="hidden tablet:table-header-group">
        <tr className="bg-papel-profundo">
          <th scope="col" className={headClass}>
            Pedido
          </th>
          <th scope="col" className={headClass}>
            Comprador
          </th>
          <th scope="col" className={headClass}>
            Vendedor / Loja
          </th>
          <th scope="col" className={headClass}>
            Valor
          </th>
          <th scope="col" className={headClass}>
            Status
          </th>
          <th scope="col" className={headClass}>
            Comprovante
          </th>
        </tr>
      </thead>
      <tbody className="flex flex-col gap-4 tablet:table-row-group">
        {items.map((item) => {
          const extra = extraItemsLabel(item.items.length - 1);
          const { phone, email } = item.buyer;
          return (
            <tr
              key={item.orderId}
              className="relative grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border border-linha bg-branco-quente p-4 focus-within:ring-2 focus-within:ring-tinta tablet:static tablet:table-row tablet:border-0 tablet:border-t tablet:p-0 tablet:first:border-t-0 tablet:focus-within:ring-0"
            >
              <td className={`order-1 ${cellClass}`}>
                <span className="block font-ui text-body-sm font-bold text-tinta">
                  #{item.orderId}
                </span>
                <span className="hidden font-ui text-label text-texto-auxiliar tablet:block">
                  {item.items[0]?.name}
                  {extra ? ` ${extra}` : ''}
                </span>
              </td>
              <td className="order-3 col-span-2 font-ui text-body font-semibold text-tinta tablet:hidden">
                {item.items[0]?.name}
                {extra ? (
                  <span className="ml-2 text-body-sm font-normal text-texto-auxiliar">{extra}</span>
                ) : null}
              </td>
              <td
                className={`order-4 col-span-2 font-ui text-body-sm text-texto-auxiliar ${cellClass}`}
              >
                <span className="tablet:block tablet:text-body-sm tablet:font-bold tablet:text-tinta">
                  <span className="tablet:hidden">Comprador: </span>
                  {item.buyer.name}
                </span>
                {phone ? <span className="block text-label tablet:text-tinta">{phone}</span> : null}
                {email ? <span className="block text-label">{email}</span> : null}
              </td>
              <td
                className={`order-5 col-span-2 font-ui text-body-sm text-texto-auxiliar ${cellClass}`}
              >
                <span className="tablet:hidden">Vendedor: </span>
                <span className="tablet:text-body-sm tablet:font-bold tablet:text-tinta">
                  {item.store.sellerName ? `${item.store.sellerName} · ` : ''}
                  {item.store.name}
                </span>
              </td>
              <td
                className={`order-6 col-span-2 flex items-center justify-between border-t border-linha pt-2 tablet:border-t-0 tablet:pt-4 ${cellClass}`}
              >
                <span className="font-ui text-body-sm text-texto-auxiliar tablet:hidden">
                  Valor do pedido
                </span>
                <span className="font-ui text-body font-bold text-tinta tablet:text-body-sm">
                  {currency.format(item.totalAmount)}
                </span>
              </td>
              <td className={`order-2 justify-self-end ${cellClass}`}>
                <PaymentStatusBadge status={item.payment.status} />
              </td>
              <td className={`absolute inset-0 tablet:static ${cellClass}`}>
                <Button
                  variant="secondary"
                  onClick={() => onViewReceipt(item)}
                  aria-label={`Ver comprovante do pedido #${item.orderId}`}
                  className="h-full w-full cursor-pointer border-0 opacity-0 tablet:h-auto tablet:w-auto tablet:border-2 tablet:opacity-100"
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
