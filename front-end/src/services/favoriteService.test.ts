import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addFavorite, listFavorites, listFavoriteIds, removeFavorite } from './favoriteService';
import { products as mockProducts } from '@/mocks/products';

const USER_ID = 'u_fav';

describe('favoriteService (mock)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('sem favoritos, a lista vem vazia', async () => {
    expect(await listFavorites(USER_ID)).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });

  it('addFavorite põe a peça na lista, a mais recente primeiro', async () => {
    await addFavorite(USER_ID, '1');
    await addFavorite(USER_ID, '2');

    const { items, total } = await listFavorites(USER_ID);

    expect(total).toBe(2);
    expect(items.map((item) => item.id)).toEqual(['2', '1']);
    expect(items[0]).toMatchObject({ name: mockProducts[1].name, status: 'ativo' });
  });

  it('addFavorite e removeFavorite são idempotentes', async () => {
    await addFavorite(USER_ID, '1');
    await addFavorite(USER_ID, '1');
    expect((await listFavorites(USER_ID)).total).toBe(1);

    await removeFavorite(USER_ID, '1');
    await removeFavorite(USER_ID, '1');
    expect((await listFavorites(USER_ID)).total).toBe(0);
  });

  it('peça vendida continua listada, com o status dizendo (RN-44)', async () => {
    const vendida = mockProducts.find((product) => product.status === 'vendido')!;
    await addFavorite(USER_ID, vendida.id);

    const { items } = await listFavorites(USER_ID);

    expect(items).toEqual([expect.objectContaining({ id: vendida.id, status: 'vendido' })]);
  });

  it('favoritar peça inexistente responde PRODUCT_NOT_FOUND', async () => {
    await expect(addFavorite(USER_ID, 'nao-existe')).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
  });

  it('os favoritos são isolados por usuário', async () => {
    await addFavorite(USER_ID, '1');

    expect((await listFavorites('outra-pessoa')).total).toBe(0);
  });

  it('listFavoriteIds devolve os ids de todas as páginas', async () => {
    const ids = mockProducts.slice(0, 3).map((product) => product.id);
    for (const id of ids) await addFavorite(USER_ID, id);

    expect(await listFavoriteIds(USER_ID)).toEqual(new Set(ids));
  });
});

describe('favoriteService (API real)', () => {
  /** Envelope `Page` do back-end#252: item do feed com `status`, preço como `Decimal`. */
  const PAGINA = {
    items: [
      {
        id: 7,
        name: 'Jaqueta jeans',
        price: '159.90',
        cover_image_url: 'https://cdn.test/7.jpg',
        status: 'reservado',
        store: { id: 3, name: 'Roupa Rodada', verified: true },
      },
    ],
    page: 1,
    page_size: 20,
    total: 1,
  };

  type Chamada = { method?: string; url?: string; params?: unknown };

  async function apiComRespostas(
    responder: (chamada: Chamada) => { status: number; data?: unknown },
  ) {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    const { httpClient } = await import('@/services/httpClient');
    const chamadas: Chamada[] = [];
    httpClient.defaults.adapter = (config) => {
      const chamada = { method: config.method, url: config.url, params: config.params };
      chamadas.push(chamada);
      const { status, data } = responder(chamada);
      const response = { data, status, statusText: '', headers: {}, config };
      if (status >= 400) {
        return Promise.reject(
          Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response, config }),
        );
      }
      return Promise.resolve(response);
    };
    return { service: await import('./favoriteService'), chamadas };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('listFavorites lê o envelope Page e converte o preço string → número', async () => {
    const { service, chamadas } = await apiComRespostas(() => ({ status: 200, data: PAGINA }));

    const resultado = await service.listFavorites(USER_ID, 1);

    expect(chamadas).toEqual([{ method: 'get', url: '/users/me/favorites', params: { page: 1 } }]);
    expect(resultado).toEqual({
      items: [
        {
          id: '7',
          name: 'Jaqueta jeans',
          price: 159.9,
          coverImageUrl: 'https://cdn.test/7.jpg',
          status: 'reservado',
          store: expect.objectContaining({ id: '3', name: 'Roupa Rodada' }),
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });

  it('addFavorite é PUT e removeFavorite é DELETE, os dois sem corpo na resposta', async () => {
    const { service, chamadas } = await apiComRespostas(() => ({ status: 204 }));

    await service.addFavorite(USER_ID, '7');
    await service.removeFavorite(USER_ID, '7');

    expect(chamadas.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'put /users/me/favorites/7',
      'delete /users/me/favorites/7',
    ]);
  });

  it('erro do back vira ApiError com o code do envelope', async () => {
    const { service } = await apiComRespostas(() => ({
      status: 404,
      data: { error: { code: 'PRODUCT_NOT_FOUND', message: 'Peça não encontrada.' } },
    }));

    await expect(service.addFavorite(USER_ID, '999')).rejects.toEqual({
      code: 'PRODUCT_NOT_FOUND',
      message: 'Peça não encontrada.',
    });
  });

  it('listFavoriteIds percorre as páginas até o total', async () => {
    const { service, chamadas } = await apiComRespostas(({ params }) => {
      const page = (params as { page: number }).page;
      return {
        status: 200,
        data: {
          ...PAGINA,
          items: [{ ...PAGINA.items[0], id: page }],
          page,
          page_size: 1,
          total: 2,
        },
      };
    });

    expect(await service.listFavoriteIds(USER_ID)).toEqual(new Set(['1', '2']));
    expect(chamadas).toHaveLength(2);
  });
});
