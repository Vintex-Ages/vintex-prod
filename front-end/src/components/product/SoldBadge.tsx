import StatusBadge from '@/components/product/StatusBadge';

/**
 * Mantém compatibilidade com os usos existentes do selo de peça vendida.
 *
 * Novos usos com diferentes estados devem utilizar StatusBadge diretamente.
 *
 * O `role="status"` fica aqui, e não no `StatusBadge`: no detalhe da peça é
 * um selo só, anunciado ao leitor de tela; numa lista, cada linha viraria
 * uma região live (#297).
 */
function SoldBadge() {
  return (
    <span role="status">
      <StatusBadge status="vendido" />
    </span>
  );
}

export default SoldBadge;
