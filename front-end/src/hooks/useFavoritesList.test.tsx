import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { FavoritesContext, type FavoritesContextValue } from '@/context/useFavorites';
import { listFavorites } from '@/services/favoriteService';
import type { FavoriteProduct } from '@/types/favorite';
import type { Paginated, ProductStatus } from '@/types/product';
import { useFavoritesList } from './useFavoritesList';

vi.mock('@/services/favoriteService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/favoriteService')>()),
  listFavorites: vi.fn(),
}));

const AUTH: AuthContextValue = {
  user: { id: 'u_1', name: 'Ana', email: 'ana@exemplo.com', is_seller: false, is_admin: false },
  token: 't',
  isAuthenticated: true,
  loading: false,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
};

const toggle = vi.fn<FavoritesContextValue['toggle']>();

const FAVORITES: FavoritesContextValue = {
  ids: new Set(['1']),
  toggle,
  loading: false,
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={AUTH}>
      <FavoritesContext.Provider value={FAVORITES}>{children}</FavoritesContext.Provider>
    </AuthContext.Provider>
  );
}

function favorito(id: string, status: ProductStatus): FavoriteProduct {
  return {
    id,
    name: `Peça ${id}`,
    price: 159.9,
    coverImageUrl: null,
    store: { id: '3', name: 'Brechó da Ana' },
    status,
  };
}

function pagina(
  items: FavoriteProduct[],
  page = 1,
  total = items.length,
): Paginated<FavoriteProduct> {
  return { items, page, pageSize: 20, total };
}

describe('useFavoritesList', () => {
  beforeEach(() => {
    vi.mocked(listFavorites).mockReset();
    toggle.mockReset().mockResolvedValue(undefined);
  });

  it('começa carregando e devolve a primeira página com o estado de cada peça', async () => {
    vi.mocked(listFavorites).mockResolvedValue(
      pagina([
        favorito('1', 'ativo'),
        favorito('2', 'vendido'),
        favorito('3', 'reservado'),
        favorito('4', 'despublicado'),
        favorito('5', 'rascunho'),
      ]),
    );

    const { result } = renderHook(() => useFavoritesList(), { wrapper });

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(listFavorites).toHaveBeenCalledWith('u_1', 1);
    expect(result.current.entries.map((entry) => [entry.product.id, entry.unavailable])).toEqual([
      ['1', undefined],
      ['2', 'vendido'],
      ['3', 'pausado'],
      ['4', 'pausado'],
      ['5', 'pausado'],
    ]);
  });

  it('carrega mais e para quando alcança o total do back', async () => {
    vi.mocked(listFavorites)
      .mockResolvedValueOnce(pagina([favorito('1', 'ativo')], 1, 2))
      .mockResolvedValueOnce(pagina([favorito('2', 'ativo')], 2, 2));

    const { result } = renderHook(() => useFavoritesList(), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(listFavorites).toHaveBeenLastCalledWith('u_1', 2);
    expect(result.current.entries.map((entry) => entry.product.id)).toEqual(['1', '2']);
    expect(result.current.hasMore).toBe(false);
  });

  it('falha ao carregar mais não apaga a lista', async () => {
    vi.mocked(listFavorites)
      .mockResolvedValueOnce(pagina([favorito('1', 'ativo')], 1, 2))
      .mockRejectedValueOnce(new Error('fora do ar'));

    const { result } = renderHook(() => useFavoritesList(), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.loadMoreError).toBe(true);
    expect(result.current.state).toMatchObject({ status: 'ready', items: [expect.anything()] });
    expect(result.current.entries).toHaveLength(1);
  });

  it('erro na primeira página vira estado de erro e o retry recomeça', async () => {
    vi.mocked(listFavorites)
      .mockRejectedValueOnce(new Error('fora do ar'))
      .mockResolvedValueOnce(pagina([favorito('1', 'ativo')]));

    const { result } = renderHook(() => useFavoritesList(), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    result.current.retry();

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.entries.map((entry) => entry.product.id)).toEqual(['1']);
  });

  it('remove pelo toggle e tira a peça da lista', async () => {
    vi.mocked(listFavorites).mockResolvedValue(
      pagina([favorito('1', 'ativo'), favorito('2', 'ativo')]),
    );

    const { result } = renderHook(() => useFavoritesList(), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      await result.current.remove('1');
    });

    expect(toggle).toHaveBeenCalledWith('1');
    expect(result.current.entries.map((entry) => entry.product.id)).toEqual(['2']);
    expect(result.current.state).toMatchObject({ status: 'ready', total: 1 });
  });

  it('falha no toggle mantém a peça e propaga o erro para a tela avisar', async () => {
    vi.mocked(listFavorites).mockResolvedValue(pagina([favorito('1', 'ativo')]));
    toggle.mockRejectedValueOnce(new Error('fora do ar'));

    const { result } = renderHook(() => useFavoritesList(), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      await expect(result.current.remove('1')).rejects.toThrow('fora do ar');
    });
    expect(result.current.entries.map((entry) => entry.product.id)).toEqual(['1']);
  });
});
