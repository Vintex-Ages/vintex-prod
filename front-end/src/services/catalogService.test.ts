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
