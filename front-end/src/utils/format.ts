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
