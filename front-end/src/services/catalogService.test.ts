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

  // Objetivo: garantir que os sete filtros do catálogo sejam enviados
  // corretamente como query params para a API.
  it('envia os 7 filtros como query params', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [] });

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
    expect(params.get('minPrice')).toBe('50');
    expect(params.get('maxPrice')).toBe('200');
    expect(params.getAll('size')).toEqual(['M', 'G']);
    expect(params.getAll('brand')).toEqual(['Nike']);
    expect(params.getAll('condition')).toEqual(['novo']);
    expect(params.getAll('color')).toEqual(['preto']);
    expect(params.get('city')).toBe('Porto Alegre');
    expect(params.get('state')).toBe('RS');
  });

  // Objetivo: garantir que filtros não preenchidos não gerem
  // query params desnecessários na requisição.
  it('não envia filtros vazios', async () => {
    vi.mocked(httpClient.get).mockResolvedValue({ data: [] });

    await getProducts();

    const [, config] = vi.mocked(httpClient.get).mock.calls[0];
    const params = config?.params as URLSearchParams;

    expect(params.toString()).toBe('');
  });
});
