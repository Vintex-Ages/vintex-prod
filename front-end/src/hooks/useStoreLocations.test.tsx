import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreSummary } from '@/types/store';

vi.mock('@/services/storeService', () => ({ searchStores: vi.fn() }));
import { searchStores } from '@/services/storeService';
import { useStoreLocations } from './useStoreLocations';

function loja(id: string, city: string, state: string): StoreSummary {
  return {
    id,
    name: `Loja ${id}`,
    description: null,
    logoUrl: null,
    city,
    state,
    verified: false,
    activeCount: 1,
  };
}

describe('useStoreLocations', () => {
  beforeEach(() => {
    vi.mocked(searchStores).mockReset();
  });

  // FE-US009-5 (#336): as opções saem das lojas, porque a localização é da
  // loja (back-end#108) e não há rota que liste cidades.
  it('percorre as páginas de lojas e devolve cada cidade/UF uma vez, em ordem', async () => {
    vi.mocked(searchStores)
      .mockResolvedValueOnce({
        items: [loja('1', 'Porto Alegre', 'RS'), loja('2', 'Florianópolis', 'SC')],
        page: 1,
        pageSize: 2,
        total: 4,
      })
      .mockResolvedValueOnce({
        items: [loja('3', 'Porto Alegre', 'RS'), loja('4', 'Canoas', 'RS')],
        page: 2,
        pageSize: 2,
        total: 4,
      });

    const { result } = renderHook(() => useStoreLocations());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(searchStores).toHaveBeenNthCalledWith(1, '', 1);
    expect(searchStores).toHaveBeenNthCalledWith(2, '', 2);
    expect(result.current.locations).toEqual([
      { city: 'Canoas', state: 'RS' },
      { city: 'Porto Alegre', state: 'RS' },
      { city: 'Florianópolis', state: 'SC' },
    ]);
  });

  it('loja sem endereço não vira opção', async () => {
    vi.mocked(searchStores).mockResolvedValueOnce({
      items: [loja('1', '', ''), loja('2', 'Pelotas', 'RS')],
      page: 1,
      pageSize: 20,
      total: 2,
    });

    const { result } = renderHook(() => useStoreLocations());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locations).toEqual([{ city: 'Pelotas', state: 'RS' }]);
  });

  it('falha na listagem deixa o filtro sem opções, sem quebrar o catálogo', async () => {
    vi.mocked(searchStores).mockRejectedValueOnce(new Error('fora do ar'));

    const { result } = renderHook(() => useStoreLocations());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.locations).toEqual([]);
    expect(result.current.error).toBe(true);
  });
});
