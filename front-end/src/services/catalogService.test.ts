import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import {
  CatalogError,
  getFeed,
  getFeedWithDetails,
  getProduct,
  getProducts,
  search,
  searchByImage,
} from './catalogService';
import { products as mockProducts } from '@/mocks/products';

const ACTIVE_COUNT = mockProducts.filter((product) => product.status === 'ativo').length;

describe('catalogService (mock)', () => {
  describe('getFeed', () => {
    // Objetivo declarado do ticket: a home roda sem backend.
    it('retorna as peças ativas do mock, paginadas', async () => {
      const page = await getFeed({});

      expect(page.items).toHaveLength(Math.min(ACTIVE_COUNT, page.pageSize));
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

      expect(page.items[0].id).toBe(mockProducts.at(-1)?.id);
    });
  });

  describe('getFeedWithDetails', () => {
    // Objetivo: card do catálogo precisa de category/condition, que o feed puro não traz.
    it('retorna as peças ativas já com category e condition', async () => {
      const page = await getFeedWithDetails({});

      expect(page.items).toHaveLength(Math.min(ACTIVE_COUNT, page.pageSize));
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

    it('filtra o feed pela categoria e devolve a contagem filtrada', async () => {
      const page = await getFeedWithDetails({ category: 'Acessórios' });

      expect(page.items).toHaveLength(0);
      expect(page.total).toBe(0);
    });
  });

  describe('getProduct', () => {
    it('retorna o detalhe completo quando o id existe', async () => {
      const product = await getProduct('1');

      expect(product.name).toBe('Jaqueta jeans vintage clara');
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
      const page = await getProducts({ category: 'Roupas', brand: 'Zara' });

      expect(page.items.map((item) => item.id)).toContain('3');
    });

    it('filtra por faixa de preço', async () => {
      const page = await getProducts({ priceMin: 200, priceMax: 260 });

      expect(page.items.map((item) => item.id)).toEqual(['3']);
    });

    it('filtra por texto (q) ignorando acentos', async () => {
      const page = await getProducts({ q: 'biker' });

      expect(page.items).toHaveLength(1);
      expect(page.items[0].id).toBe('3');
    });
  });

  describe('search', () => {
    it('com correspondência: match_type exact e os itens encontrados', async () => {
      const result = await search('zara', {});

      expect(result.match_type).toBe('exact');
      expect(result.items.map((item) => item.id)).toContain('3');
      expect(result.total).toBe(result.items.length);
      expect(result.total).toBeGreaterThan(1);
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
      const result = await search('zara', { category: 'Roupas' });
      expect(result.match_type).toBe('exact');
      expect(result.items.map((item) => item.id)).toContain('3');
    });

    it('não retorna itens que batem com o termo mas não com o filtro ativo', async () => {
      const result = await search('zara', { category: 'Sapatos' });
      expect(result.match_type).toBe('fallback');
      expect(result.items).toEqual([]);
    });
  });
});

describe('catalogService.search (HTTP, VITE_USE_MOCKS=false)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Dados adversos para testar rejeição; não são fixtures reais da busca.
  it.each([
    {
      scenario: 'resposta do feed sem match_type',
      data: { items: [], page: 1, page_size: 20, total: 0 },
    },
    {
      scenario: 'resposta com match_type desconhecido',
      data: { items: [], total: 0, match_type: 'unknown', suggestions: null },
    },
  ])('rejeita $scenario', async ({ data }) => {
    const { httpClient } = await import('@/services/httpClient');
    const { search: apiSearch } = await import('./catalogService');
    const adapter = vi.fn((config: InternalAxiosRequestConfig) =>
      Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config }),
    );
    httpClient.defaults.adapter = adapter;

    const [result] = await Promise.allSettled([apiSearch('vestido', { category: 'Roupas' })]);

    // Confirma o caminho HTTP antes de verificar a rejeição do corpo recebido.
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0]).toMatchObject({
      method: 'get',
      url: '/products',
      params: { q: 'vestido', category: 'Roupas' },
    });
    expect(result.status).toBe('rejected');
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
 * Fixture serializado de `FeedResponse`/`ProductFeedItemResponse` em
 * `develop@659951f`, com `model_dump_json()`. `price` vem **número**, porque o
 * schema tem `@field_serializer("price") -> float`; a versão anterior deste
 * fixture usava `"99.90"` e o teste passava afirmando uma conversão que a API
 * nunca exigiu.
 */
const BACKEND_FEED_RESPONSE = {
  items: [
    {
      id: 41,
      name: 'Jaqueta vintage',
      price: 99.9,
      cover_image_url: null,
      status: 'ativo',
      store: { id: 7, name: 'Brechó Aurora' },
    },
  ],
  page: 2,
  page_size: 1,
  total: 3,
};

describe('catalogService.getFeed — contrato do backend 659951f', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mapeia preço, ids, capa nula e paginação para o contrato do frontend', async () => {
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
  const imagem = (type = 'image/jpeg') => new File(['x'], 'look.jpg', { type });

  describe('catalogService.searchByImage (mock)', () => {
    it('devolve as peças ativas em ordem estável', async () => {
      const first = await searchByImage(imagem());
      const second = await searchByImage(imagem());

      expect(first.items.map((item) => item.id)).toEqual(second.items.map((item) => item.id));
      expect(first.items).toHaveLength(Math.min(ACTIVE_COUNT, first.pageSize));
      expect(first.total).toBe(ACTIVE_COUNT);
    });

    it('respeita os filtros enviados junto com a foto', async () => {
      const combined = await searchByImage(imagem(), { category: 'Roupas', brand: 'Zara' });
      const none = await searchByImage(imagem(), { category: 'Sapatos' });

      expect(combined.items.map((item) => item.id)).toContain('3');
      expect(none.items).toEqual([]);
      expect(none.total).toBe(0);
      expect(none.interpreted).toEqual({});
    });

    it('preenche interpreted com a peça mais parecida', async () => {
      const result = await searchByImage(imagem());
      const top = mockProducts.find((product) => product.status === 'ativo');

      expect(result.interpreted).toEqual({
        category: top?.category,
        color: top?.color,
        brand: top?.brand,
      });
    });

    it('rejeita tipo não suportado', async () => {
      await expect(searchByImage(imagem('application/pdf'))).rejects.toMatchObject({
        code: 'UNSUPPORTED_IMAGE_TYPE',
      });
    });

    it('rejeita foto acima de 8 MiB', async () => {
      const big = imagem();
      Object.defineProperty(big, 'size', { value: 8 * 1024 * 1024 + 1 });

      await expect(searchByImage(big)).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    });
  });

  /**
   * Fixture no formato do exemplo de `POST /api/products/search-by-image`
   * (back-end#255). Não é saída serializada do back real: a rota ainda não existe.
   */
  const BACKEND_IMAGE_SEARCH_RESPONSE = {
    items: [
      {
        id: 41,
        name: 'Jaqueta de couro',
        price: 99.9,
        cover_image_url: 'https://x.test/capa.jpg',
        status: 'ativo',
        store: { id: 7, name: 'Brechó Aurora', verified: true },
      },
    ],
    interpreted: { category: 'Jaquetas', color: 'Preto', brand: 'Zara' },
    page: 1,
    page_size: 20,
    total: 1,
  };

  describe('catalogService.searchByImage (API real)', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv('VITE_USE_MOCKS', 'false');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    async function setup(data: unknown = BACKEND_IMAGE_SEARCH_RESPONSE) {
      const { httpClient } = await import('@/services/httpClient');
      const { searchByImage: apiSearchByImage } = await import('./catalogService');
      const adapter = vi.fn((config: InternalAxiosRequestConfig) =>
        Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config }),
      );
      httpClient.defaults.adapter = adapter;
      return { apiSearchByImage, adapter, httpClient };
    }

    it('envia os filtros junto com a foto, sem q nem sort', async () => {
      const { apiSearchByImage, adapter } = await setup();

      await apiSearchByImage(
        imagem(),
        { category: 'Roupas', priceMin: 100, priceMax: 300, color: 'Preto', q: 'ignorado' },
        2,
      );

      const config = adapter.mock.calls[0][0];
      const form = config.data as FormData;
      expect(config).toMatchObject({ method: 'post', url: '/products/search-by-image' });
      expect((form.get('image') as File).name).toBe('look.jpg');
      expect(form.get('category')).toBe('Roupas');
      expect(form.get('price_min')).toBe('100');
      expect(form.get('price_max')).toBe('300');
      expect(form.get('color')).toBe('Preto');
      expect(form.get('page')).toBe('2');
      expect(form.has('q')).toBe(false);
    });

    it('rejeita tipo inválido sem fazer requisição', async () => {
      const { apiSearchByImage, adapter } = await setup();

      await expect(apiSearchByImage(imagem('application/pdf'))).rejects.toMatchObject({
        code: 'UNSUPPORTED_IMAGE_TYPE',
      });
      expect(adapter).not.toHaveBeenCalled();
    });

    it('rejeita foto grande sem fazer requisição', async () => {
      const { apiSearchByImage, adapter } = await setup();
      const big = imagem();
      Object.defineProperty(big, 'size', { value: 8 * 1024 * 1024 + 1 });

      await expect(apiSearchByImage(big)).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
      expect(adapter).not.toHaveBeenCalled();
    });

    it('mapeia itens, paginação e interpreted do envelope do back', async () => {
      const { apiSearchByImage } = await setup();

      const result = await apiSearchByImage(imagem());

      expect(result).toMatchObject({
        page: 1,
        pageSize: 20,
        total: 1,
        interpreted: { category: 'Jaquetas', color: 'Preto', brand: 'Zara' },
      });
      expect(result.items[0]).toMatchObject({
        id: '41',
        name: 'Jaqueta de couro',
        price: 99.9,
        coverImageUrl: 'https://x.test/capa.jpg',
        store: { id: '7', name: 'Brechó Aurora', verified: true },
      });
    });

    it('converte o preço quando o Decimal chega como string', async () => {
      const { apiSearchByImage } = await setup({
        ...BACKEND_IMAGE_SEARCH_RESPONSE,
        items: [{ ...BACKEND_IMAGE_SEARCH_RESPONSE.items[0], price: '99.90' }],
      });

      const result = await apiSearchByImage(imagem());

      expect(result.items[0].price).toBe(99.9);
    });

    it('rejeita preço ilegível', async () => {
      const { apiSearchByImage } = await setup({
        ...BACKEND_IMAGE_SEARCH_RESPONSE,
        items: [{ ...BACKEND_IMAGE_SEARCH_RESPONSE.items[0], price: 'abc' }],
      });

      await expect(apiSearchByImage(imagem())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('trata campo vazio de interpreted como ausente', async () => {
      const { apiSearchByImage } = await setup({
        ...BACKEND_IMAGE_SEARCH_RESPONSE,
        interpreted: { category: 'Jaquetas', color: 'Preto', brand: '' },
      });

      const result = await apiSearchByImage(imagem());

      expect(result.interpreted.brand).toBeUndefined();
    });

    it('transforma 503 em CatalogError AI_UNAVAILABLE', async () => {
      const { apiSearchByImage, httpClient } = await setup();
      httpClient.defaults.adapter = () => Promise.reject({ response: { status: 503, data: {} } });

      const error = await apiSearchByImage(imagem()).catch((caught: unknown) => caught);

      expect(error).toMatchObject({ name: 'CatalogError', code: 'AI_UNAVAILABLE' });
    });
  });
});

describe('catalogService cobertura complementar da API real', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getProducts envia todos os filtros no formato esperado pela API', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getProducts: apiGetProducts } = await import('./catalogService');

    const adapter = vi.fn((config: InternalAxiosRequestConfig) =>
      Promise.resolve({
        data: { items: [], page: 1, page_size: 20, total: 0 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }),
    );

    httpClient.defaults.adapter = adapter;

    await apiGetProducts({
      category: 'Roupas',
      priceMin: 50,
      priceMax: 300,
      size: 'M',
      brand: 'Zara',
      condition: 'Seminovo',
      color: 'Preto',
      city: 'Porto Alegre',
      state: 'RS',
      q: 'jaqueta',
      sort: 'recent',
    });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0]).toMatchObject({
      method: 'get',
      url: '/products',
      params: {
        category: 'Roupas',
        price_min: 50,
        price_max: 300,
        size: 'M',
        brand: 'Zara',
        condition: 'Seminovo',
        color: 'Preto',
        city: 'Porto Alegre',
        state: 'RS',
        q: 'jaqueta',
        sort: 'recent',
      },
    });
  });

  it('search mapeia resposta exact sem suggestions', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { search: apiSearch } = await import('./catalogService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: {
          items: [
            {
              id: 41,
              name: 'Jaqueta vintage',
              price: 99.9,
              cover_image_url: null,
              store: { id: 7, name: 'Brechó Aurora' },
            },
          ],
          total: 1,
          match_type: 'exact',
          suggestions: null,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const result = await apiSearch('jaqueta', { category: 'Roupas' });

    expect(result.match_type).toBe('exact');
    expect(result.total).toBe(1);
    expect(result.suggestions).toBeUndefined();
    expect(result.items[0]).toMatchObject({
      id: '41',
      name: 'Jaqueta vintage',
      price: 99.9,
      coverImageUrl: null,
      store: { id: '7', name: 'Brechó Aurora' },
    });
  });

  it('search mapeia fallback e os itens de suggestions', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { search: apiSearch } = await import('./catalogService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: {
          items: [],
          total: 0,
          match_type: 'fallback',
          suggestions: {
            reason: 'Nenhum resultado exato.',
            items: [
              {
                id: 42,
                name: 'Casaco vintage',
                price: 120,
                cover_image_url: 'https://x.test/casaco.jpg',
                store: { id: 8, name: 'Brechó Centro' },
              },
            ],
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const result = await apiSearch('inexistente');

    expect(result.match_type).toBe('fallback');
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.suggestions?.reason).toBe('Nenhum resultado exato.');
    expect(result.suggestions?.items[0]).toMatchObject({
      id: '42',
      name: 'Casaco vintage',
      store: { id: '8', name: 'Brechó Centro' },
    });
  });

  it('getProduct preserva code e message do envelope de erro da API', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getProduct: apiGetProduct } = await import('./catalogService');

    httpClient.defaults.adapter = () =>
      Promise.reject({
        response: {
          data: {
            error: {
              code: 'PRODUCT_NOT_FOUND',
              message: 'Produto não encontrado no backend.',
            },
          },
        },
      });

    await expect(apiGetProduct('999')).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
      message: 'Produto não encontrado no backend.',
    });
  });

  it('getProduct usa a mensagem padrão quando o envelope tem code sem message', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getProduct: apiGetProduct } = await import('./catalogService');

    httpClient.defaults.adapter = () =>
      Promise.reject({
        response: {
          data: {
            error: { code: 'PRODUCT_NOT_FOUND' },
          },
        },
      });

    await expect(apiGetProduct('999')).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
      message: 'Erro ao consultar produto.',
    });
  });

  it('getProduct normaliza erro desconhecido como INTERNAL_ERROR', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getProduct: apiGetProduct } = await import('./catalogService');

    httpClient.defaults.adapter = () => Promise.reject(new Error('falha de rede'));

    await expect(apiGetProduct('1')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Erro ao consultar produto.',
    });
  });

  it('getFeedWithDetails mantém itens válidos quando um detalhe falha', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getFeedWithDetails: apiGetFeedWithDetails } = await import('./catalogService');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    httpClient.defaults.adapter = (config) => {
      if (config.url === '/products') {
        return Promise.resolve({
          data: {
            items: [
              {
                id: 1,
                name: 'Produto válido',
                price: 100,
                cover_image_url: null,
                store: { id: 10, name: 'Loja A' },
              },
              {
                id: 2,
                name: 'Produto sem detalhe',
                price: 200,
                cover_image_url: null,
                store: { id: 20, name: 'Loja B' },
              },
            ],
            page: 1,
            page_size: 20,
            total: 2,
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
      }

      if (config.url === '/products/1') {
        return Promise.resolve({
          data: {
            id: 1,
            name: 'Produto válido',
            description: 'Descrição',
            category: 'Roupas',
            brand: 'Marca',
            color: 'Preto',
            size: 'M',
            condition: 'Seminovo',
            price: 100,
            status: 'ativo',
            city: 'Porto Alegre',
            state: 'RS',
            media: [],
            store: { id: 10, name: 'Loja A' },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
      }

      if (config.url === '/products/2') {
        return Promise.reject({
          response: {
            data: { error: { code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado.' } },
          },
        });
      }

      return Promise.reject(new Error(`URL inesperada: ${config.url}`));
    };

    const page = await apiGetFeedWithDetails({});

    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe('1');
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe('catalogService — branches restantes do coverage', () => {
  it('mock percorre todos os filtros e chega ao retorno verdadeiro de matchesFilters', async () => {
    const target = mockProducts.find((product) => product.status === 'ativo');
    expect(target).toBeDefined();

    const page = await getProducts({
      category: target!.category,
      size: target!.size,
      brand: target!.brand,
      condition: target!.condition,
      color: target!.color,
      city: target!.store.city,
      state: 'RS',
      priceMin: target!.price,
      priceMax: target!.price,
    });

    expect(page.items.map((item) => item.id)).toContain(target!.id);
  });

  it('mock cobre os filtros que rejeitam por tamanho, condição, cor, cidade e estado', async () => {
    const target = mockProducts.find((product) => product.status === 'ativo');
    expect(target).toBeDefined();

    const cases = [
      { size: '__size_inexistente__' },
      { condition: '__condicao_inexistente__' },
      { color: '__cor_inexistente__' },
      { city: '__cidade_inexistente__' },
      { state: 'SC' },
    ];

    for (const filters of cases) {
      const page = await getProducts(filters);
      expect(page.items.map((item) => item.id)).not.toContain(target!.id);
    }
  });

  it('mock cobre matchesQuery quando a correspondência acontece pela categoria', async () => {
    const target = mockProducts.find((product) => product.status === 'ativo');
    expect(target).toBeDefined();

    const result = await search(target!.category, {});

    expect(result.match_type).toBe('exact');
    expect(result.items.some((item) => item.id === target!.id)).toBe(true);
  });

  it('mock getFeedWithDetails cobre categoria existente', async () => {
    const target = mockProducts.find((product) => product.status === 'ativo');
    expect(target).toBeDefined();

    const page = await getFeedWithDetails({ category: target!.category });

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((item) => item.category === target!.category)).toBe(true);
  });

  describe('API real', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.stubEnv('VITE_USE_MOCKS', 'false');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('getFeedWithDetails cobre o caminho sem falhas nos detalhes', async () => {
      const { httpClient } = await import('@/services/httpClient');
      const { getFeedWithDetails: apiGetFeedWithDetails } = await import('./catalogService');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      httpClient.defaults.adapter = (config) => {
        if (config.url === '/products') {
          return Promise.resolve({
            data: {
              items: [
                {
                  id: 1,
                  name: 'Produto válido',
                  price: 100,
                  cover_image_url: null,
                  store: { id: 10, name: 'Loja A' },
                },
              ],
              page: 1,
              page_size: 20,
              total: 1,
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          });
        }

        if (config.url === '/products/1') {
          return Promise.resolve({
            data: {
              id: 1,
              name: 'Produto válido',
              description: 'Descrição',
              category: 'Roupas',
              brand: 'Marca',
              color: 'Preto',
              size: 'M',
              condition: 'Seminovo',
              price: 100,
              status: 'ativo',
              city: 'Porto Alegre',
              state: 'RS',
              media: [
                { type: 'image', url: 'https://x.test/segunda.jpg', position: 2 },
                { type: 'image', url: 'https://x.test/primeira.jpg', position: 1 },
              ],
              store: { id: 10, name: 'Loja A' },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          });
        }

        return Promise.reject(new Error(`URL inesperada: ${config.url}`));
      };

      const page = await apiGetFeedWithDetails({ category: 'Roupas' });

      expect(page.items).toHaveLength(1);
      expect(page.items[0].coverImageUrl).toBe('https://x.test/primeira.jpg');
      expect(warn).not.toHaveBeenCalled();
    });

    it('getProducts cobre o caminho sem nenhum filtro', async () => {
      const { httpClient } = await import('@/services/httpClient');
      const { getProducts: apiGetProducts } = await import('./catalogService');
      const adapter = vi.fn((config: InternalAxiosRequestConfig) =>
        Promise.resolve({
          data: { items: [], page: 1, page_size: 20, total: 0 },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }),
      );
      httpClient.defaults.adapter = adapter;

      await apiGetProducts({});

      expect(adapter).toHaveBeenCalledTimes(1);
      expect(adapter.mock.calls[0][0]).toMatchObject({
        method: 'get',
        url: '/products',
        params: {},
      });
    });

    it('getFeed cobre o branch de categoria enviado para a API', async () => {
      const { httpClient } = await import('@/services/httpClient');
      const { getFeed: apiGetFeed } = await import('./catalogService');
      const adapter = vi.fn((config: InternalAxiosRequestConfig) =>
        Promise.resolve({
          data: { items: [], page: 1, page_size: 20, total: 0 },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }),
      );
      httpClient.defaults.adapter = adapter;

      await apiGetFeed({ category: 'Roupas' });

      expect(adapter.mock.calls[0][0]).toMatchObject({
        params: { page: 1, page_size: 20, sort: 'recent', category: 'Roupas' },
      });
    });
  });
});

describe('catalogService — últimos branches do mock', () => {
  it('getProducts rejeita produto quando priceMax é menor que o preço', async () => {
    const target = mockProducts.find((product) => product.status === 'ativo');
    expect(target).toBeDefined();

    const page = await getProducts({ priceMax: target!.price - 0.01 });

    expect(page.items.map((item) => item.id)).not.toContain(target!.id);
  });

  it('getFeed filtra por uma categoria existente', async () => {
    const target = mockProducts.find((product) => product.status === 'ativo');
    expect(target).toBeDefined();

    const page = await getFeed({ category: target!.category });

    expect(page.items.length).toBeGreaterThan(0);
    expect(
      page.items.every((item) => {
        const detail = mockProducts.find((product) => product.id === item.id);
        return detail?.category === target!.category;
      }),
    ).toBe(true);
  });
});
