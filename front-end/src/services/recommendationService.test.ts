import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savePreferences } from '@/services/preferenceService';

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
    // produtos-base) deve aparecer, e nenhuma clmaramente de outro estilo.
    expect(items.some((item) => item.name === 'Camisa social branca')).toBe(true);
    expect(items.some((item) => item.name === 'Jaqueta biker preta')).toBe(false);
  });

  // Objetivo declarado: RN-38.
  it('sem preferências, personalized é false e não lança exceção', async () => {
    const { getRecommendations } = await import('./recommendationService');

    await expect(getRecommendations()).resolves.toMatchObject({
      personalized: false,
      items: [],
    });
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

    expect(personalized).toBe(false);
    expect(items).toEqual([]);
  });
});

describe('recommendationService (API real) — contrato proposto pelo front', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Critério de aceite: mapeador testado com fixture no envelope Page real.
   * `price` como `number`, não string — confirmado contra o back
   * (`ProductFeedItemResponse` tem `@field_serializer("price")` forçando
   * `float`, ver o comentário de `ApiFeedItem` no `catalogService.ts`).
   * `mapFeedItem` é o mesmo reaproveitado pelo feed normal, então herda
   * essa garantia — nenhuma conversão extra de dinheiro é necessária aqui.
   */
  it('mapeia o envelope Page[FeedItem] & { personalized } do contrato proposto', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getRecommendations } = await import('./recommendationService');

    const envelope = {
      items: [
        {
          id: 6,
          name: 'Camisa social branca',
          price: 89.9,
          cover_image_url: null,
          store: { id: 6, name: 'Desapego Serrano' },
        },
      ],
      page: 1,
      page_size: 20,
      total: 1,
      personalized: true,
    };

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({ data: envelope, status: 200, statusText: 'OK', headers: {}, config });

    const result = await getRecommendations(1);

    expect(result.personalized).toBe(true);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('6');
    expect(result.items[0].price).toBe(89.9);
  });

  it('personalized=false do back também é mapeado corretamente', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getRecommendations } = await import('./recommendationService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: {
          items: [
            {
              id: 6,
              name: 'Camisa social branca',
              price: 89.9,
              cover_image_url: null,
              store: { id: 6, name: 'Desapego Serrano' },
            },
          ],
          page: 1,
          page_size: 20,
          total: 1,
          personalized: false,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const result = await getRecommendations();

    expect(result.personalized).toBe(false);
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
