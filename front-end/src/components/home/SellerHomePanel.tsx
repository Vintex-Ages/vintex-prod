import HomePanel from '@/components/home/HomePanel';
import { useSellerProducts, type SellerProductsCounts } from '@/hooks/useSellerProducts';
import { paths } from '@/routes/paths';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function situation(counts: SellerProductsCounts): string {
  return [
    plural(counts.ativo, 'peça anunciada', 'peças anunciadas'),
    plural(counts.reservado, 'reservada', 'reservadas'),
    plural(counts.vendido, 'vendida', 'vendidas'),
  ].join(', ');
}

/**
 * A loja na Home de quem vende: situação das peças e atalhos para o painel e
 * para anunciar. Se as peças não carregarem, ficam os atalhos.
 *
 * Usage:
 *   {user.is_seller ? <SellerHomePanel /> : null}
 */
function SellerHomePanel() {
  const { state } = useSellerProducts();

  return (
    <HomePanel
      title="Sua loja"
      message={state.status === 'ready' ? situation(state.counts) : null}
      primary={{ label: 'Abrir minha loja', to: paths.seller }}
      links={[{ label: 'Anunciar peça', to: paths.sellerProductNew }]}
    />
  );
}

export default SellerHomePanel;
