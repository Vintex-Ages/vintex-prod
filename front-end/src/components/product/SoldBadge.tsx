/**
 * Selo "Já vendida" — sinaliza visualmente que a peça não está mais disponível.
 * Sempre renderiza; quem decide SE deve aparecer é quem usa o componente
 * (ex.: ProductDetail, a partir do status da peça). É só apresentação:
 * não contém regra de negócio.
 *
 * Usage:
 *   import SoldBadge from '@/components/product/SoldBadge';
 *   {peca.vendida && <SoldBadge />}
 */
function SoldBadge() {
  return (
    <span
      role="status"
      className="inline-flex items-center justify-center rounded-full bg-verde-rs px-2.5 py-1 text-label text-branco-quente"
    >
      Já vendida
    </span>
  );
}

export default SoldBadge;
