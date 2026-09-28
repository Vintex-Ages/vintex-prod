import StatusBadge from '@/components/product/StatusBadge';

/**
 * Mantém compatibilidade com os usos existentes do selo de peça vendida.
 *
 * Novos usos com diferentes estados devem utilizar StatusBadge diretamente.
 */
function SoldBadge() {
  return <StatusBadge status="vendido" />;
}

export default SoldBadge;
