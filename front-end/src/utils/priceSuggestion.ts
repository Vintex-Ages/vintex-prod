/**
 * Comparação entre o preço informado e a faixa sugerida pela IA (RN-68).
 * Todos os valores em centavos, como o `PriceInput`.
 * Só calcula: quem decide o que mostrar é o componente, e o resultado
 * nunca bloqueia o fluxo.
 */
export type PriceRange = { min: number; max: number };

export type PriceComparison = 'below' | 'within' | 'above' | 'none';

export function comparePriceToRange(
  price: number | null | undefined,
  range: PriceRange,
): PriceComparison {
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

/** Média da faixa, arredondada para centavos inteiros (valor do "Usar R$ X"). */
export function averagePrice(range: PriceRange): number {
  return Math.round((range.min + range.max) / 2);
}