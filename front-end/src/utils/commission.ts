/**
 * Comissão da plataforma sobre a venda (RN-11). Única implementação da regra
 * no front — formulário, revisão e painel financeiro reaproveitam daqui.
 */
export const DEFAULT_COMMISSION_RATE = 0.09;

/**
 * Valor que o vendedor recebe: preço menos a comissão. Recebe e devolve reais,
 * mas calcula em centavos inteiros, porque em float `19.9 * 0.91` dá
 * `18.108999999999998`. A comissão é arredondada para o centavo mais próximo.
 *
 * Usage:
 *   netValue(100);       // 91
 *   netValue(200, 0.1);  // 180
 */
export function netValue(price: number, rate: number = DEFAULT_COMMISSION_RATE): number {
  const priceCents = Math.round(price * 100);
  const commissionCents = Math.round(priceCents * rate);
  return (priceCents - commissionCents) / 100;
}
