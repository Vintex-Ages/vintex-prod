import { describe, expect, it } from 'vitest';
import { CATEGORIES, COLORS, CONDITIONS, SIZES } from './categories';

/**
 * Espelho do vocabulário fechado de `app/constants/catalog.py` no back, copiado
 * à mão em `back-end develop@b95fe6d`. São os valores que o catálogo grava, que
 * os filtros comparam por igualdade, e que o prompt da sugestão da IA cita.
 *
 * **O que estes testes pegam:** alguém editando `categories.ts` e tirando ou
 * trocando um valor. Foi o que já aconteceu — a lista de tamanhos tinha seis
 * valores contra os nove do catálogo, então peças em `PP`, `36` e `42` não
 * apareciam em filtro nenhum e a sugestão da IA nesses valores era descartada.
 *
 * **O que estes testes NÃO pegam:** o back mudando a lista. O valor esperado
 * está escrito aqui, neste repositório; nada lê o arquivo do back. A primeira
 * versão deste arquivo afirmava no comentário que a fonte era o back, o que
 * dava a impressão de uma garantia que não existe — e a prova de que era só
 * impressão é que a ordem de `COLORS` aqui nunca foi a do back.
 *
 * Fechar esse furo exige comparação entre os dois repositórios, no CI. Enquanto
 * não existir, quem mexer em `app/constants/catalog.py` tem que mexer aqui —
 * está escrito na issue do vocabulário (`back-end#208`).
 *
 * **Conjunto, não ordem.** A ordem em `categories.ts` é escolha de interface —
 * é a sequência dos checkboxes no painel de filtros — e é diferente da do back.
 * O contrato é o conjunto de valores, porque o filtro compara por igualdade.
 */
const DO_BACK = {
  categories: ['Roupas', 'Sapatos', 'Acessórios'],
  colors: ['Preto', 'Branco', 'Bege', 'Vermelho', 'Azul', 'Verde', 'Estampado'],
  conditions: ['Novo com etiqueta', 'Seminovo', 'Usado', 'Marcas de uso'],
  sizes: ['PP', 'P', 'M', 'G', 'GG', '36', '38', '40', '42'],
};

function conjunto(valores: readonly string[]): string[] {
  return [...valores].sort();
}

describe('vocabulário do catálogo × back-end', () => {
  it('tamanhos: mesmo conjunto que o catálogo grava', () => {
    expect(conjunto(SIZES)).toEqual(conjunto(DO_BACK.sizes));
    expect(SIZES).toHaveLength(DO_BACK.sizes.length);
  });

  it('cores: mesmo conjunto que o catálogo grava', () => {
    expect(conjunto(COLORS)).toEqual(conjunto(DO_BACK.colors));
    expect(COLORS).toHaveLength(DO_BACK.colors.length);
  });

  it('conservação: mesmo conjunto que o catálogo grava', () => {
    expect(conjunto(CONDITIONS)).toEqual(conjunto(DO_BACK.conditions));
  });

  it('categorias: as três famílias do catálogo, e nada além', () => {
    const valores = CATEGORIES.filter((c) => c.value).map((c) => c.value as string);
    expect(conjunto(valores)).toEqual(conjunto(DO_BACK.categories));
  });
});
