import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CatalogError,
  getFeed,
  getFeedWithDetails,
  getProduct,
  getProducts,
  search,
} from './catalogService';
import { products as mockProducts } from '@/mocks/products';

const ACTIVE_COUNT = mockProducts.filter((product) => product.status === 'ativo').length;

describe('catalogService (mock)', () => {
  describe('getFeed', () => {
    // Objetivo declarado do ticket: a home roda sem backend.
    it('retorna as peças ativas do mock, paginadas', async () => {
      const page = await getFeed({});

      expect(page.items).toHaveLength(ACTIVE_COUNT);
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(20);
      expect(page.total).toBe(ACTIVE_COUNT);
    });

    it('não inclui peças vendidas', async () => {
      const page = await getFeed({});

      expect(page.items.some((item) => item.id === '4')).toBe(false);
    });

    it('respeita page/pageSize e mantém o total real', async () => {
      const page = await getFeed({ page: 2, pageSize: 3 });

      expect(page.items).toHaveLength(3);
      expect(page.page).toBe(2);
      expect(page.pageSize).toBe(3);
      expect(page.total).toBe(ACTIVE_COUNT);
    });

    it('ordena as mais recentes primeiro', async () => {
      const page = await getFeed({ pageSize: 1 });

      expect(page.items[0].id).toBe('8');
    });
  });

  describe('getFeedWithDetails', () => {
    // Objetivo: card do catálogo precisa de category/condition, que o feed puro não traz.
    it('retorna as peças ativas já com category e condition', async () => {
      const page = await getFeedWithDetails({});

      expect(page.items).toHaveLength(ACTIVE_COUNT);
      expect(page.items.every((item) => typeof item.category === 'string')).toBe(true);
      expect(page.items.every((item) => typeof item.condition === 'string')).toBe(true);
    });

    it('mantém a mesma ordenação e paginação de getFeed', async () => {
      const [plain, withDetails] = await Promise.all([
        getFeed({ page: 2, pageSize: 3 }),
        getFeedWithDetails({ page: 2, pageSize: 3 }),
      ]);

      expect(withDetails.items.map((item) => item.id)).toEqual(plain.items.map((item) => item.id));
      expect(withDetails.page).toBe(2);
      expect(withDetails.pageSize).toBe(3);
      expect(withDetails.total).toBe(ACTIVE_COUNT);
    });
  });

  describe('getProduct', () => {
    it('retorna o detalhe completo quando o id existe', async () => {
      const product = await getProduct('1');

      expect(product.name).toBe('Nike Camiseta Preto');
      expect(product.category).toBe('Roupas');
      expect(product.media.length).toBeGreaterThan(0);
    });

    it('rejeita com CatalogError PRODUCT_NOT_FOUND quando o id não existe', async () => {
      await expect(getProduct('inexistente')).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });
      await expect(getProduct('inexistente')).rejects.toBeInstanceOf(CatalogError);
    });
  });

  describe('getProducts', () => {
    it('combina filtros de categoria e marca', async () => {
      const page = await getProducts({ category: 'Sapatos', brand: 'Adidas' });

      expect(page.items).toHaveLength(1);
      expect(page.items[0].id).toBe('3');
    });

    it('filtra por faixa de preço', async () => {
      const page = await getProducts({ priceMin: 200, priceMax: 260 });

      expect(page.items.map((item) => item.id).sort()).toEqual(['3', '6']);
    });

    it('filtra por texto (q) ignorando acentos', async () => {
      const page = await getProducts({ q: 'tenis' });

      expect(page.items).toHaveLength(1);
      expect(page.items[0].id).toBe('3');
    });
  });

  describe('search', () => {
    it('com correspondência: match_type exact e os itens encontrados', async () => {
      const result = await search('nike', {});

      expect(result.match_type).toBe('exact');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.suggestions).toBeUndefined();
    });

    // Objetivo declarado do ticket: alimentar a US-010 (alternativas em vez de tela vazia).
    it('sem correspondência: match_type fallback com suggestions', async () => {
      const result = await search('bermuda cargo', {});

      expect(result.match_type).toBe('fallback');
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.suggestions?.items.length).toBeGreaterThan(0);
      expect(result.suggestions?.reason).toContain('bermuda cargo');
    });

    it('combina o termo de busca com os filtros ativos, sem descartar nenhum', async () => {
      const result = await search('nike', { category: 'Roupas' });
      expect(result.match_type).toBe('exact');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('1');
    });

    it('não retorna itens que batem com o termo mas não com o filtro ativo', async () => {
      const result = await search('nike', { category: 'Sapatos' });
      expect(result.match_type).toBe('fallback');
      expect(result.items).toEqual([]);
    });
  });
});

describe('catalogService (API real) — mapeamento da loja', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Objetivo: FE-US012-1 (card da loja no detalhe) consome logoUrl/verified —
  // até então `verified` nem chegava a ser mapeado do back real, só existia no mock.
  it('mapeia logo_url e verified da loja pro Store do front (FE-US012-1)', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getProduct: apiGetProduct } = await import('./catalogService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: {
          id: 1,
          name: 'Vestido floral',
          description: 'Vestido floral em ótimo estado.',
          category: 'Roupas',
          brand: 'Farm',
          color: 'Floral',
          size: 'M',
          condition: 'Seminovo',
          price: 99.9,
          status: 'ativo',
          city: 'Porto Alegre',
          state: 'RS',
          media: [],
          store: { id: 5, name: 'Brechó Ana', logo_url: 'https://x.test/logo.png', verified: true },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const product = await apiGetProduct('1');

    expect(product.store).toMatchObject({
      id: '5',
      name: 'Brechó Ana',
      city: 'Porto Alegre',
      logoUrl: 'https://x.test/logo.png',
      verified: true,
    });
  });

  it('deixa logoUrl/verified undefined quando o back não os envia', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getProduct: apiGetProduct } = await import('./catalogService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: {
          id: 1,
          name: 'Vestido floral',
          description: 'Vestido floral em ótimo estado.',
          category: 'Roupas',
          brand: 'Farm',
          color: 'Floral',
          size: 'M',
          condition: 'Seminovo',
          price: 99.9,
          status: 'ativo',
          city: 'Porto Alegre',
          state: 'RS',
          media: [],
          store: { id: 5, name: 'Brechó Ana' },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const product = await apiGetProduct('1');

    expect(product.store.logoUrl).toBeUndefined();
    expect(product.store.verified).toBeUndefined();
  });
});

/**
 * Dados reconstruídos a partir do contrato e dos testes do backend em
 * origin/develop@887b24d. Não são uma resposta capturada de uma API em execução.
 */
const BACKEND_FEED_RESPONSE = {
  items: [
    {
      id: 41,
      name: 'Jaqueta vintage',
      price: '99.90',
      cover_image_url: null,
      status: 'ativo',
      store: { id: 7, name: 'Brechó Aurora' },
    },
  ],
  page: 2,
  page_size: 1,
  total: 3,
};

describe('catalogService.getFeed — contrato do backend 887b24d', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mapeia decimal, ids, capa nula e paginação para o contrato do frontend', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getFeed: apiGetFeed } = await import('./catalogService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: BACKEND_FEED_RESPONSE,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const page = await apiGetFeed({ page: 2, pageSize: 1 });

    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(1);
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe('41');
    expect(page.items[0].name).toBe('Jaqueta vintage');
    expect(page.items[0].store.id).toBe('7');
    expect(page.items[0].store.name).toBe('Brechó Aurora');
    expect(page.items[0].coverImageUrl).toBeNull();
    expect(page.items[0].price).toBe(99.9);
  });
});

describe('catalogService.getFeed — seleção explícita mock/API', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('VITE_USE_MOCKS_FEED=false prevalece sobre o global e envia GET /products com paginação e sort', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');
    vi.stubEnv('VITE_USE_MOCKS_FEED', 'false');

    const { httpClient } = await import('@/services/httpClient');
    const { getFeed: configuredGetFeed } = await import('./catalogService');
    const adapter = vi.fn((config) =>
      Promise.resolve({
        data: BACKEND_FEED_RESPONSE,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }),
    );
    httpClient.defaults.adapter = adapter;

    await configuredGetFeed({ page: 2, pageSize: 1, sort: 'recent' });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0]).toMatchObject({
      method: 'get',
      url: '/products',
      params: { page: 2, page_size: 1, sort: 'recent' },
    });
  });

  it('propaga erro HTTP quando o feed real está ativo, sem retornar produtos mockados', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');
    vi.stubEnv('VITE_USE_MOCKS_FEED', 'false');

    const { httpClient } = await import('@/services/httpClient');
    const { getFeed: configuredGetFeed } = await import('./catalogService');
    const backendError = new Error('falha HTTP do feed');
    httpClient.defaults.adapter = () => Promise.reject(backendError);

    await expect(configuredGetFeed()).rejects.toBe(backendError);
  });

  it('sem override específico herda VITE_USE_MOCKS=true', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');

    const { httpClient } = await import('@/services/httpClient');
    const { getFeed: configuredGetFeed } = await import('./catalogService');
    const adapter = vi.fn(() => Promise.reject(new Error('não deveria chamar HTTP')));
    httpClient.defaults.adapter = adapter;

    const page = await configuredGetFeed();

    expect(page.items).toHaveLength(ACTIVE_COUNT);
    expect(adapter).not.toHaveBeenCalled();
  });

  it('VITE_USE_MOCKS_FEED=true prevalece sobre VITE_USE_MOCKS=false', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    vi.stubEnv('VITE_USE_MOCKS_FEED', 'true');

    const { httpClient } = await import('@/services/httpClient');
    const { getFeed: configuredGetFeed } = await import('./catalogService');
    const adapter = vi.fn(() => Promise.reject(new Error('não deveria chamar HTTP')));
    httpClient.defaults.adapter = adapter;

    const page = await configuredGetFeed();

    expect(page.items).toHaveLength(ACTIVE_COUNT);
    expect(adapter).not.toHaveBeenCalled();
  });

  it('ativar a API do feed mantém detalhe, busca e feed enriquecido nos mocks', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');
    vi.stubEnv('VITE_USE_MOCKS_FEED', 'false');

    const { httpClient } = await import('@/services/httpClient');
    const {
      getFeedWithDetails: configuredGetFeedWithDetails,
      getProduct: configuredGetProduct,
      search: configuredSearch,
    } = await import('./catalogService');
    const adapter = vi.fn(() => Promise.reject(new Error('não deveria chamar HTTP')));
    httpClient.defaults.adapter = adapter;

    const [product, searchResult, enrichedFeed] = await Promise.all([
      configuredGetProduct('1'),
      configuredSearch('nike'),
      configuredGetFeedWithDetails(),
    ]);

    expect(product.id).toBe('1');
    expect(searchResult.match_type).toBe('exact');
    expect(enrichedFeed.items).toHaveLength(ACTIVE_COUNT);
    expect(adapter).not.toHaveBeenCalled();
  });
});
