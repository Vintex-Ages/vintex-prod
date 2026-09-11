import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '@/services/httpClient';
import { getProducts } from './catalogService';

vi.mock('@/services/httpClient', () => ({
  httpClient: {
    get: vi.fn(),
  },
}));

describe('catalogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Garante que todos os filtros sejam enviados com os nomes
  // esperados pelo contrato do backend.
  it('envia os filtros como query params', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      data: {
        items: [],
        page: 1,
        page_size: 20,
        total: 0,
        applied_filters: {},
      },
    });

    await getProducts({
      category: 'roupas',
      minPrice: 50,
      maxPrice: 200,
      size: ['M', 'G'],
      brand: ['Nike'],
      condition: ['novo'],
      color: ['preto'],
      city: 'Porto Alegre',
      state: 'RS',
    });

    expect(httpClient.get).toHaveBeenCalledTimes(1);

    const [, config] = vi.mocked(httpClient.get).mock.calls[0];
    const params = config?.params as URLSearchParams;

    expect(params.get('category')).toBe('roupas');
    expect(params.get('price_min')).toBe('50');
    expect(params.get('price_max')).toBe('200');
    expect(params.getAll('size')).toEqual(['M', 'G']);
    expect(params.getAll('brand')).toEqual(['Nike']);
    expect(params.getAll('condition')).toEqual(['novo']);
    expect(params.getAll('color')).toEqual(['preto']);
    expect(params.get('city')).toBe('Porto Alegre');
    expect(params.get('state')).toBe('RS');
  });

  // Garante que filtros não preenchidos não sejam enviados
  // desnecessariamente para a API.
  it('não envia filtros vazios', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({
      data: {
        items: [],
        page: 1,
        page_size: 20,
        total: 0,
      },
    });

    await getProducts();

    const [, config] = vi.mocked(httpClient.get).mock.calls[0];
    const params = config?.params as URLSearchParams;

    expect(params.toString()).toBe('');
  });

  // Garante que o service devolva o FeedResponse recebido da API.
  it('retorna os dados do feed', async () => {
    const response = {
      items: [
        {
          id: 1,
          name: 'Jaqueta',
          price: 120,
          cover_image_url: null,
          store: {
            id: 10,
            name: 'Brechó Centro',
          },
          status: 'ativo',
        },
      ],
      page: 1,
      page_size: 20,
      total: 1,
    };

    vi.mocked(httpClient.get).mockResolvedValue({ data: response });

    await expect(getProducts()).resolves.toEqual(response);
  });
});
