import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductDetail } from '@/types/product';
import type { CombinationError } from './combinationService';

type CombinationModule = typeof import('./combinationService');

function peca(
  overrides: Partial<ProductDetail> & Pick<ProductDetail, 'id' | 'name'>,
): ProductDetail {
  return {
    price: 100,
    coverImageUrl: `/img/${overrides.id}.jpg`,
    store: { id: '1', name: 'Brechó Um' },
    category: 'Roupas',
    size: 'M',
    color: 'Preto',
    brand: 'Marca',
    condition: 'Usado',
    description: '',
    status: 'ativo',
    media: [],
    style: 'vintage-80-90',
    ...overrides,
  };
}

async function failure(promise: Promise<unknown>): Promise<CombinationError> {
  try {
    await promise;
  } catch (error) {
    return error as CombinationError;
  }
  throw new Error('A chamada deveria ter falhado.');
}

describe('combinationService (mock)', () => {
  let combinations: CombinationModule;

  /** Carrega o service com um catálogo pequeno e conhecido no lugar do catálogo de demonstração. */
  async function withCatalog(catalog: ProductDetail[]) {
    vi.resetModules();
    vi.doMock('@/mocks/products', () => ({ products: catalog }));
    combinations = await import('./combinationService');
  }

  afterEach(() => {
    vi.doUnmock('@/mocks/products');
  });

  it('exact: devolve peças de categoria diferente, de mais de uma loja, com o total', async () => {
    await withCatalog([
      peca({ id: 'calca', name: 'Calça jeans reta', price: 120 }),
      peca({ id: 'outra-calca', name: 'Calça de sarja', price: 90 }),
      peca({
        id: 'blusa',
        name: 'Blusa bordada',
        price: 80,
        store: { id: '2', name: 'Brechó Dois' },
      }),
      peca({ id: 'jaqueta', name: 'Jaqueta jeans', price: 150.5 }),
    ]);

    const result = await combinations.getCombinations('calca');

    expect(result.matchType).toBe('exact');
    expect(result.pieces.map((piece) => piece.id).sort()).toEqual(['blusa', 'jaqueta']);
    // Nunca a mesma categoria da origem (calça com calça) nem a própria peça.
    expect(result.pieces.every((piece) => piece.category !== 'Parte de baixo')).toBe(true);
    expect(new Set(result.pieces.map((piece) => piece.category)).size).toBe(result.pieces.length);
    // O conjunto atravessa lojas, e cada peça traz a sua.
    expect(new Set(result.pieces.map((piece) => piece.store.id)).size).toBe(2);
    expect(result.totalAmount).toBe(230.5);
  });

  it('o total é a soma dos preços devolvidos, sem erro de ponto flutuante', async () => {
    await withCatalog([
      peca({ id: 'calca', name: 'Calça jeans' }),
      peca({ id: 'blusa', name: 'Blusa lisa', price: 0.1 }),
      peca({ id: 'jaqueta', name: 'Jaqueta jeans', price: 0.2 }),
    ]);

    const result = await combinations.getCombinations('calca');

    // 0,1 + 0,2 em ponto flutuante dá 0,30000000000000004.
    expect(result.totalAmount).toBe(0.3);
  });

  it('só devolve peça ativa: vendida, reservada e pausada ficam de fora', async () => {
    await withCatalog([
      peca({ id: 'calca', name: 'Calça jeans' }),
      peca({ id: 'blusa-ativa', name: 'Blusa ativa' }),
      peca({ id: 'blusa-vendida', name: 'Blusa vendida', status: 'vendido' }),
      peca({ id: 'blusa-reservada', name: 'Blusa reservada', status: 'reservado' }),
      peca({ id: 'blusa-pausada', name: 'Blusa pausada', status: 'despublicado' }),
    ]);

    const result = await combinations.getCombinations('calca');

    expect(result.pieces.map((piece) => piece.id)).toEqual(['blusa-ativa']);
  });

  it('fallback: sem par de estilo, devolve peças ativas de outras categorias, nunca vazio', async () => {
    await withCatalog([
      peca({ id: 'calca', name: 'Calça jeans', style: 'vintage-80-90' }),
      peca({ id: 'blusa', name: 'Blusa lisa', style: 'y2k' }),
      peca({ id: 'vestido', name: 'Vestido midi', style: 'boho-romantico' }),
    ]);

    const result = await combinations.getCombinations('calca');

    expect(result.matchType).toBe('fallback');
    expect(result.pieces.length).toBeGreaterThan(0);
    expect(result.pieces.every((piece) => piece.category !== 'Parte de baixo')).toBe(true);
    expect(result.totalAmount).toBe(200);
  });

  it('fallback também quando a peça de origem não tem estilo (sem vetor)', async () => {
    await withCatalog([
      peca({ id: 'calca', name: 'Calça jeans', style: undefined }),
      peca({ id: 'blusa', name: 'Blusa lisa' }),
    ]);

    const result = await combinations.getCombinations('calca');

    expect(result.matchType).toBe('fallback');
    expect(result.pieces.map((piece) => piece.id)).toEqual(['blusa']);
  });

  it('origem vendida responde normalmente (a combinação também dispara depois da compra)', async () => {
    await withCatalog([
      peca({ id: 'calca', name: 'Calça jeans', status: 'vendido' }),
      peca({ id: 'blusa', name: 'Blusa lisa' }),
    ]);

    const result = await combinations.getCombinations('calca');

    expect(result.pieces.map((piece) => piece.id)).toEqual(['blusa']);
  });

  it('origem reservada também responde 200', async () => {
    await withCatalog([
      peca({ id: 'calca', name: 'Calça jeans', status: 'reservado' }),
      peca({ id: 'blusa', name: 'Blusa lisa' }),
    ]);

    expect((await combinations.getCombinations('calca')).pieces).toHaveLength(1);
  });

  it('peça inexistente vira CombinationError PRODUCT_NOT_FOUND', async () => {
    await withCatalog([peca({ id: 'calca', name: 'Calça jeans' })]);

    const error = await failure(combinations.getCombinations('999'));

    expect(error.name).toBe('CombinationError');
    expect(error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('no máximo uma peça por categoria, no máximo três peças', async () => {
    await withCatalog([
      peca({ id: 'calca', name: 'Calça jeans' }),
      peca({ id: 'blusa-1', name: 'Blusa um' }),
      peca({ id: 'blusa-2', name: 'Blusa dois' }),
      peca({ id: 'jaqueta', name: 'Jaqueta jeans' }),
      peca({ id: 'vestido', name: 'Vestido midi' }),
      peca({ id: 'casaco', name: 'Casaco de lã' }),
    ]);

    const { pieces } = await combinations.getCombinations('calca');

    expect(pieces.length).toBeLessThanOrEqual(3);
    expect(new Set(pieces.map((piece) => piece.category)).size).toBe(pieces.length);
  });

  it('com o catálogo de demonstração, combina uma peça real sem repetir categoria nem a origem', async () => {
    vi.resetModules();
    vi.doUnmock('@/mocks/products');
    const real = await import('./combinationService');
    const { products } = await import('@/mocks/products');

    const result = await real.getCombinations('1');

    expect(result.pieces.length).toBeGreaterThan(0);
    expect(result.pieces.map((piece) => piece.id)).not.toContain('1');
    for (const piece of result.pieces) {
      expect(products.find((product) => product.id === piece.id)?.status).toBe('ativo');
    }
    expect(result.totalAmount).toBeCloseTo(
      result.pieces.reduce((sum, piece) => sum + piece.price, 0),
      2,
    );
  });
});

describe('combinationService (API real) — contrato da back-end#328', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const API_RESPONSE = {
    pieces: [
      {
        id: 7,
        name: 'Blusa bordada',
        price: '79.90',
        category: 'Blusas',
        cover_image_url: '/img/7.jpg',
        store: { id: 2, name: 'Garimpo da Redenção' },
      },
      {
        id: 9,
        name: 'Sapato oxford',
        price: 120,
        category: 'Calçados',
        cover_image_url: null,
        store: { id: 5, name: 'Baú da Vó Nair' },
      },
    ],
    match_type: 'exact',
    total_amount: '199.90',
  };

  interface Call {
    url?: string;
    method?: string;
  }

  /** Troca o adaptador do `httpClient`: `respond` devolve o corpo ou um erro com `response`. */
  async function stubAdapter(respond: () => unknown) {
    const { httpClient } = await import('@/services/httpClient');
    const calls: Call[] = [];
    httpClient.defaults.adapter = (config) => {
      calls.push({ url: config.url, method: config.method });
      const result = respond();
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve({ data: result, status: 200, statusText: 'OK', headers: {}, config });
    };
    return calls;
  }

  function httpError(status: number) {
    return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: {} } });
  }

  it('chama GET /products/{id}/combinations e converte os campos', async () => {
    const calls = await stubAdapter(() => API_RESPONSE);
    const { getCombinations } = await import('./combinationService');

    const result = await getCombinations('3');

    expect(calls).toEqual([{ url: '/products/3/combinations', method: 'get' }]);
    expect(result).toEqual({
      pieces: [
        {
          id: '7',
          name: 'Blusa bordada',
          price: 79.9,
          category: 'Blusas',
          coverImageUrl: '/img/7.jpg',
          store: { id: '2', name: 'Garimpo da Redenção' },
        },
        {
          id: '9',
          name: 'Sapato oxford',
          price: 120,
          category: 'Calçados',
          coverImageUrl: null,
          store: { id: '5', name: 'Baú da Vó Nair' },
        },
      ],
      matchType: 'exact',
      totalAmount: 199.9,
    });
  });

  it('fallback: repassa o match_type e aceita número no total', async () => {
    await stubAdapter(() => ({ ...API_RESPONSE, match_type: 'fallback', total_amount: 199.9 }));
    const { getCombinations } = await import('./combinationService');

    const result = await getCombinations('3');

    expect(result.matchType).toBe('fallback');
    expect(result.totalAmount).toBe(199.9);
  });

  it('404 vira CombinationError PRODUCT_NOT_FOUND', async () => {
    await stubAdapter(() => httpError(404));
    const { getCombinations } = await import('./combinationService');

    const error = await failure(getCombinations('999'));

    expect(error.name).toBe('CombinationError');
    expect(error.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('outro erro de servidor vira INTERNAL_ERROR', async () => {
    await stubAdapter(() => httpError(500));
    const { getCombinations } = await import('./combinationService');

    const error = await failure(getCombinations('3'));

    expect(error.code).toBe('INTERNAL_ERROR');
  });

  it('preço ilegível na resposta vira INTERNAL_ERROR, não NaN na tela', async () => {
    await stubAdapter(() => ({
      ...API_RESPONSE,
      pieces: [{ ...API_RESPONSE.pieces[0], price: 'abc' }],
    }));
    const { getCombinations } = await import('./combinationService');

    const error = await failure(getCombinations('3'));

    expect(error.name).toBe('CombinationError');
    expect(error.code).toBe('INTERNAL_ERROR');
  });
});
