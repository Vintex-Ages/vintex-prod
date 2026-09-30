import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDraft,
  getById,
  getMine,
  getSalesSummary,
  publish,
  SellerProductError,
  unpublish,
  update,
  uploadMedia,
} from './sellerProductService';
import { logout, register } from './authService';

/** Peças de exemplo do mock, uma de cada status (ver `seedProducts`). */
const DRAFT_WITHOUT_IMAGE = 'seller-mock-1';
const ACTIVE = 'seller-mock-2';
const SOLD = 'seller-mock-3';
const UNPUBLISHED = 'seller-mock-4';

/** O mock de auth vive em memória entre os testes: cada cadastro precisa de e-mail novo. */
let userSeq = 0;

async function registerNewUser(): Promise<void> {
  userSeq += 1;
  await register({
    name: 'Vendedora',
    email: `pecas${userSeq}@vintex.com`,
    password: 'senha123',
  });
}

async function expectErrorCode(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(SellerProductError);
  expect((error as SellerProductError).code).toBe(code);
}

describe('sellerProductService', () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    await logout();
    await registerNewUser();
  });

  // Teste 1 da #202 — RN-47 na camada certa.
  it('publish sem imagem devolve NO_IMAGE', async () => {
    await expectErrorCode(publish(DRAFT_WITHOUT_IMAGE), 'NO_IMAGE');
    expect((await getById(DRAFT_WITHOUT_IMAGE)).status).toBe('rascunho');
  });

  // Teste 2 da #202 — RN-53.
  it('update de peça vendida devolve PRODUCT_SOLD', async () => {
    await expectErrorCode(update(SOLD, { price: 10 }), 'PRODUCT_SOLD');
    expect((await getById(SOLD)).price).toBe(120);
  });

  it('publish e unpublish de peça vendida também devolvem PRODUCT_SOLD', async () => {
    await expectErrorCode(publish(SOLD), 'PRODUCT_SOLD');
    await expectErrorCode(unpublish(SOLD), 'PRODUCT_SOLD');
  });

  // Teste 3 da #202 — despublicar preserva o histórico (RN-52).
  it('unpublish leva a despublicado e a peça continua em getMine', async () => {
    const unpublished = await unpublish(ACTIVE);

    expect(unpublished.status).toBe('despublicado');
    const mine = await getMine();
    expect(mine.items.find((item) => item.id === ACTIVE)?.status).toBe('despublicado');
  });

  // Teste 4 da #202 — republicar é a mesma transição de publicar.
  it('publish de peça despublicada volta pra ativo', async () => {
    const republished = await publish(UNPUBLISHED);

    expect(republished.status).toBe('ativo');
  });

  // Teste 5 da #202 — o modo edição carrega peça pausada, que o detalhe público não traz.
  it('getById de peça despublicada devolve a peça completa', async () => {
    const product = await getById(UNPUBLISHED);

    expect(product).toMatchObject({
      id: UNPUBLISHED,
      name: 'Camisa Xadrez Flanela',
      status: 'despublicado',
      price: 89.9,
      quantity: 1,
      images: ['https://picsum.photos/seed/vintex-seller-4/600/800'],
      aiCorrections: [],
    });
    expect(product.store).toMatchObject({ id: expect.any(String), name: expect.any(String) });
  });

  it('getById de id desconhecido devolve PRODUCT_NOT_FOUND', async () => {
    await expectErrorCode(getById('nao-existe'), 'PRODUCT_NOT_FOUND');
  });

  it('as peças são do usuário: outro usuário não vê a peça criada pelo primeiro', async () => {
    const draft = await createDraft({ name: 'Saia Plissada', price: 59.9 });

    await logout();
    await registerNewUser();

    await expectErrorCode(getById(draft.id), 'PRODUCT_NOT_FOUND');
  });

  it('createDraft cria rascunho com quantity 1 e exige nome e preço', async () => {
    const corrections = [{ field: 'brand' as const, suggested: 'Zara', final: 'Farm' }];
    const draft = await createDraft({ name: 'Saia Plissada', price: 59.9 }, corrections);

    expect(draft).toMatchObject({
      name: 'Saia Plissada',
      price: 59.9,
      status: 'rascunho',
      quantity: 1,
      images: [],
      aiCorrections: corrections,
    });
    expect(await getById(draft.id)).toEqual(draft);
    await expectErrorCode(createDraft({ price: 10 }), 'VALIDATION_ERROR');
  });

  it('update aplica só os campos enviados e acumula as correções da IA', async () => {
    const first = [{ field: 'color' as const, suggested: 'Azul', final: 'Verde' }];
    const second = [{ field: 'size' as const, suggested: null, final: 'M' }];
    const draft = await createDraft({ name: 'Saia Plissada', price: 59.9 }, first);

    const updated = await update(draft.id, { images: ['https://cdn.test/a.jpg'] }, second);

    expect(updated).toMatchObject({ name: 'Saia Plissada', images: ['https://cdn.test/a.jpg'] });
    expect(updated.aiCorrections).toEqual([...first, ...second]);
    expect((await publish(draft.id)).status).toBe('ativo');
  });

  it('getMine filtra por status e pagina', async () => {
    const all = await getMine();
    expect(all.total).toBe(4);
    expect(all.items.map((item) => item.status).sort()).toEqual([
      'ativo',
      'despublicado',
      'rascunho',
      'vendido',
    ]);

    const sold = await getMine({ status: 'vendido' });
    expect(sold.items.map((item) => item.id)).toEqual([SOLD]);

    const firstPage = await getMine({ page: 1, pageSize: 3 });
    expect(firstPage).toMatchObject({ page: 1, pageSize: 3, total: 4 });
    expect(firstPage.items).toHaveLength(3);
  });

  it('getSalesSummary soma as vendidas em reais e desconta a comissão de 9%', async () => {
    expect(await getSalesSummary('month')).toEqual({
      period: 'month',
      soldCount: 1,
      gross: 120,
      commission: 10.8,
      net: 109.2,
    });
  });

  it('uploadMedia devolve uma URL por arquivo, na mesma ordem', async () => {
    const urls = await uploadMedia([
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ]);

    expect(urls).toHaveLength(2);
    urls.forEach((url) => expect(typeof url).toBe('string'));
  });
});

describe('sellerProductService com a API real', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // FE-US019-2 (#221): a rota é a declarada na back-end#234.
  it('getById busca GET /users/me/products/{id} e mapeia a peça completa', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getById: apiGetById } = await import('./sellerProductService');
    const urls: string[] = [];

    httpClient.defaults.adapter = (config) => {
      urls.push(`${config.method} ${config.url}`);
      return Promise.resolve({
        data: {
          id: 7,
          name: 'Jaqueta jeans',
          price: '120.00',
          status: 'despublicado',
          description: null,
          category: 'Roupas',
          size: 'M',
          color: 'Azul',
          brand: null,
          condition: 'Seminovo',
          style: null,
          images: ['https://api.test/foto.jpg'],
          store: { id: 3, name: 'Brechó da Ana', city: 'Porto Alegre' },
          ai_corrections: [],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    const peca = await apiGetById('7');

    expect(urls).toEqual(['get /users/me/products/7']);
    expect(peca).toMatchObject({
      id: '7',
      price: 120,
      status: 'despublicado',
      images: ['https://api.test/foto.jpg'],
      store: { id: '3', name: 'Brechó da Ana' },
    });
  });

  // docs/adr/0002 (#297): sem a rota do vendedor, cai no detalhe público.
  describe('sem a rota do vendedor (back-end#234)', () => {
    type Resposta = { status: number; data: unknown };

    /** Responde por URL; status >= 400 rejeita como o axios, com o envelope do back. */
    async function responderPorUrl(respostas: Record<string, Resposta>) {
      const { httpClient } = await import('@/services/httpClient');
      const urls: string[] = [];
      httpClient.defaults.adapter = (config) => {
        urls.push(`${config.method} ${config.url}`);
        const resposta = respostas[config.url ?? ''];
        const response = {
          data: resposta.data,
          status: resposta.status,
          statusText: '',
          headers: {},
          config,
        };
        return resposta.status >= 400
          ? Promise.reject(Object.assign(new Error('HTTP'), { response, config }))
          : Promise.resolve(response);
      };
      return urls;
    }

    function erro(status: number, code: string): Resposta {
      return { status, data: { error: { code, message: code } } };
    }

    /** `ProductDetailResponse` do back: vazio vem como `""`, fotos em `media`. */
    const detalhePublico = {
      id: 7,
      name: 'Jaqueta jeans',
      description: '',
      category: 'Roupas',
      style: '',
      brand: '',
      color: 'Azul',
      size: 'M',
      condition: 'Seminovo',
      price: '120.00',
      status: 'ativo',
      city: 'Porto Alegre',
      state: 'RS',
      media: [
        { type: 'image', url: 'https://api.test/2.jpg', position: 1 },
        { type: 'image', url: 'https://api.test/1.jpg', position: 0 },
      ],
      store: { id: 3, name: 'Brechó da Ana', verified: false, logo_url: null },
    };

    it('405 da rota do vendedor cai no detalhe público e mapeia para o formulário', async () => {
      const urls = await responderPorUrl({
        '/users/me/products/7': erro(405, 'METHOD_NOT_ALLOWED'),
        '/products/7': { status: 200, data: detalhePublico },
      });
      const { getById: apiGetById } = await import('./sellerProductService');

      const peca = await apiGetById('7');

      expect(urls).toEqual(['get /users/me/products/7', 'get /products/7']);
      expect(peca).toEqual({
        id: '7',
        name: 'Jaqueta jeans',
        price: 120,
        status: 'ativo',
        description: undefined,
        category: 'Roupas',
        size: 'M',
        color: 'Azul',
        brand: undefined,
        condition: 'Seminovo',
        style: undefined,
        images: ['https://api.test/1.jpg', 'https://api.test/2.jpg'],
        quantity: 1,
        store: { id: '3', name: 'Brechó da Ana', city: 'Porto Alegre' },
        aiCorrections: [],
      });
    });

    it('peça pausada (PRODUCT_NOT_FOUND no público) vira NOT_AVAILABLE_YET', async () => {
      await responderPorUrl({
        '/users/me/products/7': erro(405, 'METHOD_NOT_ALLOWED'),
        '/products/7': erro(404, 'PRODUCT_NOT_FOUND'),
      });
      const { getById: apiGetById } = await import('./sellerProductService');

      await expect(apiGetById('7')).rejects.toMatchObject({ code: 'NOT_AVAILABLE_YET' });
    });

    it('erro de verdade da rota do vendedor não cai no fallback', async () => {
      const urls = await responderPorUrl({
        '/users/me/products/7': erro(404, 'PRODUCT_NOT_FOUND'),
      });
      const { getById: apiGetById } = await import('./sellerProductService');

      await expect(apiGetById('7')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      expect(urls).toEqual(['get /users/me/products/7']);
    });

    it('resumo financeiro sem rota (NOT_FOUND genérico) vira NOT_AVAILABLE_YET', async () => {
      await responderPorUrl({
        '/users/me/sales/summary': erro(404, 'NOT_FOUND'),
      });
      const { getSalesSummary: apiGetSalesSummary } = await import('./sellerProductService');

      await expect(apiGetSalesSummary('month')).rejects.toMatchObject({
        code: 'NOT_AVAILABLE_YET',
      });
    });
  });
});
