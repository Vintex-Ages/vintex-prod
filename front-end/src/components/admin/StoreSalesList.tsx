import type { StoreSales } from '@/types/dashboard';
import { formatCentsToBRL } from '@/utils/format';

/** Os valores do painel vêm em reais; o formatador do projeto recebe centavos. */
const brl = (reais: number) => formatCentsToBRL(Math.round(reais * 100));

/**
 * Vendas por loja no painel geral (FE-US033-1, #413), no estilo do "Store
 * Ranking Row" do Figma (556:52): posição, nome da loja e valor vendido.
 *
 * A ordem é a que o back devolveu (hoje, do maior valor para o menor): a lista
 * não reordena, e a posição é só o lugar na lista. Sem os dados que o back não
 * manda (responsável, peças vendidas) e sem as cores ouro/prata/bronze, que
 * não existem na paleta.
 *
 * Usage:
 *   <StoreSalesList items={dashboard.salesByStore} />
 */
export function StoreSalesList({ items }: { items: StoreSales[] }) {
  return (
    <div className="flex flex-col">
      <div
        aria-hidden="true"
        className="flex justify-between border-b border-linha pb-3 font-ui text-label font-bold uppercase text-texto-auxiliar"
      >
        <span>Loja</span>
        <span>Valor vendido</span>
      </div>
      <ol className="flex flex-col divide-y divide-linha">
        {items.map((store, index) => (
          <li key={store.storeId} className="flex items-center gap-2.5 py-2">
            <span
              aria-hidden="true"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-linha bg-branco-quente font-ui text-label font-bold text-tinta"
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 break-words font-ui text-body-sm font-semibold text-tinta">
              {store.storeName}
            </span>
            <span className="shrink-0 whitespace-nowrap font-ui text-body-sm font-bold text-tinta">
              {brl(store.amount)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
