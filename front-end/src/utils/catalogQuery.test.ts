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

  // FE-US009-4 (#337): o link carrega todos os valores marcados, não só o primeiro.
  it('ida e volta com vários valores no mesmo campo', () => {
    const search = toCatalogSearch({ size: ['M', 'G'], color: 'Preto' });

    expect(search).toBe('?size=M&size=G&color=Preto');
    expect(fromCatalogSearch(new URLSearchParams(search))).toEqual({
      size: ['M', 'G'],
      color: ['Preto'],
    });
  });

  it('ignora preço que não é número e deixa q de fora dos filtros', () => {
    expect(fromCatalogSearch(new URLSearchParams('?q=jaqueta&priceMax=abc'))).toEqual({});
  });
});
