import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savePreferences } from '@/services/preferenceService';
import { mapFeedItem, type ApiFeedItem } from '@/services/catalogService';
import { products as mockProducts } from '@/mocks/products';

/**
 * Feed genérico com o mesmo critério do mock do `catalogService`: só `ativo`,
 * mais recente primeiro (ordem invertida do mock), na forma de `Product`.
 */
const genericFeed = mockProducts
  .filter((product) => product.status === 'ativo')
  .reverse()
  .map(({ id, name, price, coverImageUrl, store }) => ({ id, name, price, coverImageUrl, store }));

describe('recommendationService (mock)', () => {
  beforeEach(async () => {
    await savePreferences([]);
  });

  afterEach(async () => {
    await savePreferences([]);
  });

  // Objetivo declarado: RN-64.
  it('com preferência "Alfaiataria", o mock só devolve peças desse estilo', async () => {
    const { getRecommendations } = await import('./recommendationService');
    await savePreferences([{ type: 'estilo', value: 'alfaiataria' }]);

    const { items, personalized } = await getRecommendations();

    expect(personalized).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    // `Product` (o item devolvido) não carrega `style` — a garantia aqui é
    // indireta: toda peça com esse nome/categoria batendo com o fixture do
    // mock de "Camisa social branca" (a única marcada alfaiataria nos
    // produtos-base) deve aparecer, e nenhuma claramente de outro estilo.
    expect(items.some((item) => item.name === 'Camisa social branca')).toBe(true);
    expect(items.some((item) => item.name === 'Jaqueta biker preta')).toBe(false);
  });

  // Objetivo declarado (#355): RN-38 + RN-61 — sem preferências não é erro
  // nem lista vazia, é o feed genérico com personalized: false.
  it('sem preferências, devolve as peças do feed genérico com personalized: false', async () => {
    const { getRecommendations } = await import('./recommendationService');

    const result = await getRecommendations();

    expect(result.personalized).toBe(false);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items).toEqual(genericFeed.slice(0, 20));
    expect(result.total).toBe(genericFeed.length);
  });

  it('pagina o feed genérico com o mesmo pageSize do mock', async () => {
    const { getRecommendations } = await import('./recommendationService');

    const page1 = await getRecommendations(1);
    const page2 = await getRecommendations(2);

    expect(page1).toMatchObject({ page: 1, pageSize: 20, total: genericFeed.length });
    expect(page1.items).toHaveLength(20);
    expect(page2).toMatchObject({ page: 2, pageSize: 20, total: genericFeed.length });
    expect(page2.items).toEqual(genericFeed.slice(20, 40));
  });

  it('com preferência de um estilo sem nenhuma peça correspondente, personalized continua true (RN-38 é só sobre "sem preferência")', async () => {
    const { getRecommendations } = await import('./recommendationService');
    await savePreferences([{ type: 'estilo', value: 'y2k' }]);

    const { personalized } = await getRecommendations();

    expect(personalized).toBe(true);
  });

  it('respeita a paginação (page, pageSize)', async () => {
    const { getRecommendations } = await import('./recommendationService');
    await savePreferences([{ type: 'estilo', value: 'vintage-80-90' }]);

    const page1 = await getRecommendations(1);

    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(20);
    expect(page1.items.length).toBeLessThanOrEqual(20);
    expect(page1.total).toBeGreaterThan(0);
  });

  it('ignora preferências que não são do tipo "estilo"', async () => {
    const { getRecommendations } = await import('./recommendationService');
    await savePreferences([{ type: 'tamanho', value: 'M' }]);

    const { personalized, items } = await getRecommendations();

    // Sem preferência de estilo = sem preferências: feed genérico (RN-38/RN-61).
    expect(personalized).toBe(false);
    expect(items).toEqual(genericFeed.slice(0, 20));
  });
});

describe('recommendationService (API real) — contrato do back-end#253 (05/10)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Item no formato do feed, como o back fechou em back-end#253. */
  function feedItem(overrides: Record<string, unknown> = {}) {
    return {
      id: 6,
      name: 'Camisa social branca',
      price: 89.9 as number | string,
      cover_image_url: 'https://cdn.test/camisa.jpg' as string | null,
      status: 'ativo',
      store: { id: 6, name: 'Desapego Serrano', verified: true },
      ...overrides,
    };
  }

  async function respondWith(data: unknown) {
    const { httpClient } = await import('@/services/httpClient');
    httpClient.defaults.adapter = (config) =>
      Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });
  }

  // Objetivo declarado (#355): a fixture do back sai pelo mapFeedItem.
  it('mapeia o envelope { items, personalized, page, page_size, total } pelo mapFeedItem', async () => {
    const item = feedItem();
    await respondWith({ items: [item], personalized: true, page: 1, page_size: 20, total: 1 });
    const { getRecommendations } = await import('./recommendationService');

    const result = await getRecommendations(1);

    expect(result).toEqual({
      items: [mapFeedItem(item as ApiFeedItem)],
      personalized: true,
      page: 1,
      pageSize: 20,
      total: 1,
    });
    // Mesmo formato do feed (`Product`): sem `status` nem campos snake_case.
    expect(result.items[0]).toEqual({
      id: '6',
      name: 'Camisa social branca',
      price: 89.9,
      coverImageUrl: 'https://cdn.test/camisa.jpg',
      store: { id: '6', name: 'Desapego Serrano', verified: true },
    });
    expect(result.items[0]).not.toHaveProperty('status');
  });

  it('personalized: false vem com os itens do feed genérico (RN-38), com preço em string', async () => {
    const items = [
      feedItem({ price: '89.90' }),
      feedItem({ id: 7, name: 'Jaqueta biker preta', price: '149.00', cover_image_url: null }),
    ];
    await respondWith({ items, personalized: false, page: 1, page_size: 20, total: 2 });
    const { getRecommendations } = await import('./recommendationService');

    const result = await getRecommendations();

    expect(result.personalized).toBe(false);
    expect(result.total).toBe(2);
    expect(result.items).toEqual([
      mapFeedItem({ ...items[0], price: 89.9 } as ApiFeedItem),
      mapFeedItem({ ...items[1], price: 149 } as ApiFeedItem),
    ]);
  });

  it('envia a página pedida como query param', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getRecommendations } = await import('./recommendationService');

    const calls: unknown[] = [];
    httpClient.defaults.adapter = (config) => {
      calls.push(config.params);
      return Promise.resolve({
        data: { items: [], page: 2, page_size: 20, total: 0, personalized: false },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    await getRecommendations(2);

    expect(calls).toEqual([{ page: 2 }]);
  });
});
