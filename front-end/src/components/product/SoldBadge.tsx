/**
 * Selo "Já vendida" — sinaliza visualmente que a peça não está mais disponível.
 * Sempre renderiza; quem decide SE deve aparecer é quem usa o componente
 * (ex.: ProductDetail, a partir do status da peça). É só apresentação:
 * não contém regra de negócio.
 *
 * Cor neutra, nao `verde-rs`: verde e "confianca e confirmacao" na paleta e e
 * o mesmo verde do selo Confiavel, que aparece na MESMA tela. Uma peca vendida
 * e indisponibilidade — pintada de verde, lia como disponivel/confirmada.
 *
 * Usage:
 *   import SoldBadge from '@/components/product/SoldBadge';
 *   {peca.vendida && <SoldBadge />}
 */
function SoldBadge() {
  return (
    <span
      role="status"
      className="inline-flex items-center justify-center rounded-full bg-tinta px-3 py-1 text-label font-semibold text-branco-quente"
    >
      Já vendida
    </span>
  );
}

export default SoldBadge;
