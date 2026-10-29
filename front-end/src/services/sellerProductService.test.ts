import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDraft,
  discardDraft,
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
  // FE-US019-6 (#345): a aba de rascunhos lista com `?status=rascunho` e
  // descarta apagando a peça (back-end#271).
  it('getMine com status rascunho lista só os rascunhos', async () => {
    const page = await getMine({ status: 'rascunho' });

    expect(page.items.map((item) => item.id)).toEqual([DRAFT_WITHOUT_IMAGE]);
  });

  it('discardDraft apaga o rascunho', async () => {
    await discardDraft(DRAFT_WITHOUT_IMAGE);

    expect((await getMine({ status: 'rascunho' })).items).toEqual([]);
    await expectErrorCode(getById(DRAFT_WITHOUT_IMAGE), 'PRODUCT_NOT_FOUND');
  });

  it('discardDraft recusa peça que não é rascunho, como o back', async () => {
    await expectErrorCode(discardDraft(ACTIVE), 'PRODUCT_NOT_EDITABLE');
    await expectErrorCode(discardDraft(SOLD), 'PRODUCT_SOLD');
    expect((await getById(ACTIVE)).status).toBe('ativo');
  });

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

  // #358: a listagem leva a capa (foto de posição 0) das peças publicadas e
  // deixa `null` no rascunho sem foto — o `SellerProductRow` mostra o placeholder.
  it('getMine devolve a capa das peças publicadas e null no rascunho sem foto', async () => {
    const byId = new Map((await getMine()).items.map((item) => [item.id, item]));

    expect(byId.get(ACTIVE)?.coverImageUrl).toBe(
      'https://picsum.photos/seed/vintex-seller-2/600/800',
    );
    expect(byId.get(SOLD)?.coverImageUrl).toBe(
      'https://picsum.photos/seed/vintex-seller-3/600/800',
    );
    expect(byId.get(UNPUBLISHED)?.coverImageUrl).toBe(
      'https://picsum.photos/seed/vintex-seller-4/600/800',
    );
    expect(byId.get(DRAFT_WITHOUT_IMAGE)?.coverImageUrl).toBeNull();
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

  // #318: a foto da etiqueta sobe pelo mesmo uploadMedia, marcada como etiqueta.
  it('uploadMedia aceita o kind da etiqueta e devolve a URL do mesmo jeito', async () => {
    const urls = await uploadMedia(
      [new File(['e'], 'etiqueta.jpg', { type: 'image/jpeg' })],
      'label',
    );

    expect(urls).toHaveLength(1);
    expect(typeof urls[0]).toBe('string');
  });

  // #318: composição lida da etiqueta, guardada como qualquer outro campo do formulário.
  it('composition passa pelo ciclo criar/editar e não aparece na listagem', async () => {
    const draft = await createDraft({
      name: 'Camisa de Linho',
      price: 89.9,
      composition: '100% linho',
    });
    expect(draft.composition).toBe('100% linho');
    expect((await getById(draft.id)).composition).toBe('100% linho');

    const updated = await update(draft.id, { composition: '55% linho, 45% algodão' });
    expect(updated.composition).toBe('55% linho, 45% algodão');
    expect((await getById(draft.id)).composition).toBe('55% linho, 45% algodão');

    const untouched = await update(draft.id, { price: 79.9 });
    expect(untouched.composition).toBe('55% linho, 45% algodão');

    const listed = (await getMine()).items.find((item) => item.id === draft.id);
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty('composition');
  });
});

/**
 * Fixture serializado de `ProductManagementPage`/`ProductManagementResponse`
 * em `back-end@c5bce0d` (back-end#265): `cover_image_url` é a foto de posição 0
 * e vem nula no rascunho sem foto (RN-47). `price` vem número por causa do
 * `@field_serializer("price") -> float` do schema.
 */
const BACKEND_MANAGEMENT_PAGE = {
  items: [
    {
      id: 41,
      name: 'Jaqueta Jeans Oversized',
      description: 'Jaqueta jeans com lavagem clara.',
      category: 'Roupas',
      style: 'casual',
      brand: "Levi's",
      color: 'Azul',
      size: 'G',
      condition: 'Usado',
      price: 199.9,
      quantity: 1,
      status: 'ativo',
      cover_image_url: 'https://api.test/capa.jpg',
    },
    {
      id: 42,
      name: 'Saia Plissada',
      description: null,
      category: 'Roupas',
      style: null,
      brand: null,
      color: null,
      size: null,
      condition: null,
      price: 59.9,
      quantity: 1,
      status: 'rascunho',
      cover_image_url: null,
    },
  ],
  page: 1,
  page_size: 20,
  total: 2,
};

describe('sellerProductService com a API real', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // #358: a listagem do back traz a capa (back-end#265); o mapeador leva a URL
  // pra `coverImageUrl` e mantém `null` quando a peça não tem foto.
  it('getMine mapeia cover_image_url e mantém null no rascunho sem capa', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getMine: apiGetMine } = await import('./sellerProductService');
    const urls: string[] = [];

    httpClient.defaults.adapter = (config) => {
      urls.push(`${config.method} ${config.url}`);
      return Promise.resolve({
        data: BACKEND_MANAGEMENT_PAGE,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    const page = await apiGetMine();

    expect(urls).toEqual(['get /users/me/products']);
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(page.items[0]).toMatchObject({
      id: '41',
      status: 'ativo',
      price: 199.9,
      coverImageUrl: 'https://api.test/capa.jpg',
    });
    expect(page.items[1]).toMatchObject({
      id: '42',
      status: 'rascunho',
      coverImageUrl: null,
    });
  });

  // FE-US019-6 (#345): rotas do back-end#271 (PR back-end#323).
  it('lista rascunhos com ?status=rascunho e descarta com DELETE', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getMine: apiGetMine, discardDraft: apiDiscardDraft } =
      await import('./sellerProductService');
    const calls: string[] = [];

    httpClient.defaults.adapter = (config) => {
      calls.push(`${config.method} ${config.url} ${JSON.stringify(config.params ?? {})}`);
      const data =
        config.method === 'delete' ? '' : { items: [], page: 1, page_size: 20, total: 0 };
      return Promise.resolve({
        data,
        status: config.method === 'delete' ? 204 : 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    await apiGetMine({ status: 'rascunho' });
    await apiDiscardDraft('42');

    expect(calls[0]).toContain('get /users/me/products');
    expect(calls[0]).toContain('"status":"rascunho"');
    expect(calls[1]).toBe('delete /users/me/products/42 {}');
  });

  it('descartar peça que não é rascunho devolve o código do back (409)', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { discardDraft: apiDiscardDraft, SellerProductError: ApiError } =
      await import('./sellerProductService');

    httpClient.defaults.adapter = () =>
      Promise.reject({
        response: {
          status: 409,
          data: {
            error: { code: 'PRODUCT_NOT_EDITABLE', message: 'Só rascunho pode ser descartado.' },
          },
        },
      });

    const error = await apiDiscardDraft('41').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as InstanceType<typeof ApiError>).code).toBe('PRODUCT_NOT_EDITABLE');
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

  /** `ProductDraftResponse` completo, como o back devolve (sem campo faltando). */
  function draftResponse(composition: string | null) {
    return {
      id: 9,
      name: 'Camisa de Linho',
      description: null,
      category: 'Roupas',
      style: null,
      brand: 'Zara',
      color: 'Branco',
      size: 'M',
      condition: 'Seminovo',
      composition,
      price: '89.90',
      quantity: 1,
      status: 'rascunho',
      store: { id: 3, name: 'Brechó da Ana', city: 'Porto Alegre' },
      images: [],
      ai_corrections: [],
    };
  }

  // #318: `composition` só existe no detalhe; `null` vira campo ausente, nunca inventado.
  it('mapeia composition do ProductDraftResponse: string fica, null some', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getById: apiGetById } = await import('./sellerProductService');
    let composition: string | null = '100% linho';

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: draftResponse(composition),
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    expect((await apiGetById('9')).composition).toBe('100% linho');

    composition = null;
    expect((await apiGetById('9')).composition).toBeUndefined();
  });

  it('createDraft e update mandam composition no corpo, sem código novo', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { createDraft: apiCreateDraft, update: apiUpdate } =
      await import('./sellerProductService');
    const bodies: unknown[] = [];

    httpClient.defaults.adapter = (config) => {
      bodies.push(JSON.parse(config.data as string));
      return Promise.resolve({
        data: draftResponse('100% linho'),
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    await apiCreateDraft({ name: 'Camisa de Linho', price: 89.9, composition: '100% linho' });
    await apiUpdate('9', { composition: '100% linho' });

    expect(bodies[0]).toMatchObject({ composition: '100% linho' });
    expect(bodies[1]).toEqual({ composition: '100% linho', ai_corrections: [] });
  });

  // #318: o `kind` era fixo em `photo`; a etiqueta sobe com o dela.
  it('uploadMedia manda kind photo por padrão e kind label para a etiqueta', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { uploadMedia: apiUploadMedia } = await import('./sellerProductService');
    const kinds: unknown[] = [];

    httpClient.defaults.adapter = (config) => {
      kinds.push((config.data as FormData).get('kind'));
      return Promise.resolve({
        data: {
          items: [
            { key: 'k', url: 'https://api.test/m/1.jpg', content_type: 'image/jpeg', size: 1 },
          ],
        },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      });
    };

    const file = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    expect(await apiUploadMedia([file])).toEqual(['https://api.test/m/1.jpg']);
    expect(await apiUploadMedia([file], 'label')).toEqual(['https://api.test/m/1.jpg']);
    expect(kinds).toEqual(['photo', 'label']);
  });

  // #339: o detalhe do vendedor usa exclusivamente a rota autenticada.
  describe('detalhe do vendedor sem fallback público', () => {
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

    it('405 na rota do vendedor não consulta o detalhe público', async () => {
      const urls = await responderPorUrl({
        '/users/me/products/7': erro(405, 'METHOD_NOT_ALLOWED'),
      });
      const { getById: apiGetById } = await import('./sellerProductService');

      await expect(apiGetById('7')).rejects.toMatchObject({ code: 'METHOD_NOT_ALLOWED' });
      expect(urls).toEqual(['get /users/me/products/7']);
    });

    it.each(['rascunho', 'ativo', 'vendido', 'despublicado'] as const)(
      'getById carrega peça %s pela rota do vendedor, sem consultar o detalhe público',
      async (status) => {
        const urls = await responderPorUrl({
          '/users/me/products/7': {
            status: 200,
            data: { ...draftResponse(null), id: 7, status },
          },
          '/products/7': erro(404, 'PRODUCT_NOT_FOUND'),
        });
        const { getById: apiGetById } = await import('./sellerProductService');

        const peca = await apiGetById('7');
        expect(peca).toMatchObject({ id: '7', status, name: 'Camisa de Linho' });
        expect(urls).toEqual(['get /users/me/products/7']);
      },
    );

    it('404 de peça de outro vendedor não consulta o detalhe público', async () => {
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
