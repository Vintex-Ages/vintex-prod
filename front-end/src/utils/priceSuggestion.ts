/**
 * Comparação entre o preço informado e a faixa sugerida pela IA (RN-68).
 * Todos os valores em reais.
 * Só calcula: quem decide o que mostrar é o componente, e o resultado
 * nunca bloqueia o fluxo.
 */
export type PriceRange = { min: number; max: number };

export type PriceRangePosition = 'below' | 'within' | 'above' | 'none';

export function priceRangePosition(
  price: number | null | undefined,
  range: PriceRange,
): PriceRangePosition {
  if (price === null || price === undefined || !Number.isFinite(price)) {
    return 'none';
  }
  if (price < range.min) {
    return 'below';
  }
  if (price > range.max) {
    return 'above';
  }
  return 'within';
}

/** Média da faixa, arredondada para reais (valor do "Usar R$ X"). */
export function averagePrice(range: PriceRange): number {
  return Math.round(((range.min + range.max) / 2) * 100) / 100;
}
