import { describe, expect, it } from 'vitest';
import { averagePrice, comparePriceToRange } from './priceSuggestion';

const range = { min: 8000, max: 12000 };

describe('comparePriceToRange', () => {
  it('retorna "within" para preço dentro da faixa', () => {
    expect(comparePriceToRange(10000, range)).toBe('within');
  });

  it('considera os limites min e max como dentro da faixa', () => {
    expect(comparePriceToRange(8000, range)).toBe('within');
    expect(comparePriceToRange(12000, range)).toBe('within');
  });

  it('retorna "below" para preço abaixo da faixa', () => {
    expect(comparePriceToRange(7999, range)).toBe('below');
  });

  it('retorna "above" para preço acima da faixa', () => {
    expect(comparePriceToRange(12001, range)).toBe('above');
  });

  it('retorna "none" quando ainda não há preço informado', () => {
    expect(comparePriceToRange(null, range)).toBe('none');
    expect(comparePriceToRange(undefined, range)).toBe('none');
  });

  it('retorna "none" para preço inválido', () => {
    expect(comparePriceToRange(Number.NaN, range)).toBe('none');
  });
});

describe('averagePrice', () => {
  it('calcula a média da faixa', () => {
    expect(averagePrice(range)).toBe(10000);
  });

  it('arredonda para centavos inteiros', () => {
    expect(averagePrice({ min: 1000, max: 1001 })).toBe(1001);
  });
});