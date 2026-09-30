import { describe, expect, it } from 'vitest';
import { fromCatalogSearch, toCatalogSearch } from './catalogQuery';

describe('catalogQuery', () => {
  it('monta a query string só com os filtros presentes', () => {
    expect(toCatalogSearch({ category: 'Casacos', color: 'Preto', priceMax: 100 })).toBe(
      '?category=Casacos&color=Preto&priceMax=100',
    );
  });

  it('sem filtro devolve string vazia', () => {
    expect(toCatalogSearch({})).toBe('');
    expect(toCatalogSearch({ color: '  ' })).toBe('');
  });

  it('ida e volta: o que o link escreve o catálogo lê', () => {
    const search = toCatalogSearch({
      category: 'Casacos',
      color: 'Preto',
      size: 'M',
      priceMin: 50,
      priceMax: 100,
    });

    expect(fromCatalogSearch(new URLSearchParams(search))).toEqual({
      category: 'Casacos',
      color: ['Preto'],
      size: ['M'],
      minPrice: 50,
      maxPrice: 100,
    });
  });

  it('ignora preço que não é número e deixa q de fora dos filtros', () => {
    expect(fromCatalogSearch(new URLSearchParams('?q=jaqueta&priceMax=abc'))).toEqual({});
  });
});
