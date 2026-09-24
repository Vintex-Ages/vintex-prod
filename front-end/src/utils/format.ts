/**
 * Formatação de texto compartilhada entre telas. Só apresentação.
 *
 * Existe para o produto contar peça de um jeito só: a home dizia
 * "7 peças encontradas" e o catálogo "7 resultado(s)" — duas palavras para a
 * mesma coisa, e uma delas com o plural entre parênteses, que é a marca de
 * texto que ninguém escreveu de propósito.
 */
export function formatPieceCount(total: number): string {
  return total === 1 ? '1 peça' : `${total} peças`;
}

/**
 * Formata um valor em centavos como moeda BR: 123456 -> "R$ 1.234,56".
 * Usa `toLocaleString` só para o agrupamento de milhar do inteiro (não usa
 * `Intl.NumberFormat` com `style: 'currency'` de propósito: essa API insere
 * um espaço non-breaking (U+00A0) depois de "R$" em vez de espaço normal,
 * o que quebra comparação exata de string nos testes e fica inconsistente
 * visualmente).
 */
export function formatCentsToBRL(cents: number): string {
  const safeCents = Math.max(0, Math.trunc(cents));
  const reais = Math.floor(safeCents / 100);
  const centavos = safeCents % 100;
  return `R$ ${reais.toLocaleString('pt-BR')},${String(centavos).padStart(2, '0')}`;
}
