import { describe, expect, it } from 'vitest';
import { CATEGORIES, COLORS, CONDITIONS, SIZES } from './categories';

/**
 * Vocabulário fechado: são os valores que o catálogo grava e que os filtros
 * comparam por igualdade. A fonte é `app/constants/catalog.py` no back, e o
 * prompt da sugestão da IA cita a mesma lista.
 *
 * Estes testes existem porque a lista de tamanhos já divergiu: tinha seis
 * valores e o catálogo gravava nove, então peças em `PP`, `36` e `42` não
 * apareciam em filtro nenhum e a sugestão da IA nesses valores era descartada.
 * Divergir de novo quebra as duas coisas em silêncio.
 */
describe('vocabulário do catálogo', () => {
  it('tamanhos batem com os que o catálogo grava', () => {
    expect([...SIZES]).toEqual(['PP', 'P', 'M', 'G', 'GG', '36', '38', '40', '42']);
  });

  it('cores batem com as que o catálogo grava', () => {
    expect([...COLORS]).toEqual([
      'Preto',
      'Branco',
      'Azul',
      'Verde',
      'Vermelho',
      'Bege',
      'Estampado',
    ]);
  });

  it('conservação bate com a que o catálogo grava', () => {
    expect([...CONDITIONS]).toEqual(['Novo com etiqueta', 'Seminovo', 'Usado', 'Marcas de uso']);
  });

  it('as categorias com valor são as três famílias do catálogo', () => {
    const valores = CATEGORIES.filter((c) => c.value).map((c) => c.value);
    expect(valores).toEqual(['Roupas', 'Acessórios', 'Sapatos']);
  });
});
