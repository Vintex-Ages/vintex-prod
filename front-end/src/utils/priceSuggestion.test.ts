import { describe, expect, it } from 'vitest';
import { averagePrice, comparePriceToRange } from './priceSuggestion';

const range = { min: 80, max: 120 };

describe('comparePriceToRange', () => {
  it('retorna "within" para preço dentro da faixa', () => {
    expect(comparePriceToRange(100, range)).toBe('within');
  });

  it('considera os limites min e max como dentro da faixa', () => {
    expect(comparePriceToRange(80, range)).toBe('within');
    expect(comparePriceToRange(120, range)).toBe('within');
  });

  it('retorna "below" para preço abaixo da faixa', () => {
    expect(comparePriceToRange(79.99, range)).toBe('below');
  });

  it('retorna "above" para preço acima da faixa', () => {
    expect(comparePriceToRange(120.01, range)).toBe('above');
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
    expect(averagePrice(range)).toBe(100);
  });

  it('mantém os centavos da média', () => {
    expect(averagePrice({ min: 10, max: 15.5 })).toBe(12.75);
  });
});
