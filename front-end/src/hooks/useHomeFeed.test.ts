import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeedWithDetails } from '@/services/catalogService';
import {
  getRecommendationsWithDetails,
  type RecommendationsWithDetails,
} from '@/services/recommendationService';
import type { Paginated, Product, ProductDetail } from '@/types/product';
import { useHomeFeed } from './useHomeFeed';

vi.mock('@/services/catalogService', () => ({ getFeedWithDetails: vi.fn() }));
vi.mock('@/services/recommendationService', () => ({ getRecommendationsWithDetails: vi.fn() }));

function produto(id: string): Product {
  return {
    id,
    name: `Peça ${id}`,
    price: 50,
    coverImageUrl: null,
    store: { id: 's', name: 'Loja' },
  };
}

function detalhe(id: string): ProductDetail {
  return {
    ...produto(id),
    category: 'Roupas',
    size: 'M',
    color: 'Preto',
    brand: 'Vintage',
    condition: 'Usado',
    description: '',
    status: 'ativo',
    media: [],
  };
}

function feedPage(ids: string[], page = 1, total = ids.length): Paginated<ProductDetail> {
  return { items: ids.map(detalhe), page, pageSize: 20, total };
}

function recs(
  ids: string[],
  page = 1,
  total = ids.length,
  personalized = true,
): RecommendationsWithDetails {
  return { items: ids.map(detalhe), personalized, page, pageSize: 20, total };
}

/** Promise controlada de fora, para decidir a ordem em que as respostas voltam. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

const ids = (feed: Paginated<Product> | null) => feed?.items.map((item) => item.id);

describe('useHomeFeed', () => {
  beforeEach(() => {
    vi.mocked(getFeedWithDetails).mockReset();
    vi.mocked(getRecommendationsWithDetails).mockReset();
  });

  it('deslogado usa o feed, sem chamar recomendações', async () => {
    vi.mocked(getFeedWithDetails).mockResolvedValue(feedPage(['1']));

    const { result } = renderHook(() => useHomeFeed(false, undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getFeedWithDetails).toHaveBeenCalledWith();
    expect(getRecommendationsWithDetails).not.toHaveBeenCalled();
    expect(ids(result.current.feed)).toEqual(['1']);
  });

  it('logado sem categoria usa getRecommendationsWithDetails e entrega no formato Paginated<ProductDetail>', async () => {
    vi.mocked(getRecommendationsWithDetails).mockResolvedValue(recs(['r1', 'r2'], 1, 2));

    const { result } = renderHook(() => useHomeFeed(true, undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getRecommendationsWithDetails).toHaveBeenCalledWith(1);
    expect(getFeedWithDetails).not.toHaveBeenCalled();
    // Sem `personalized`: a grade não distingue o genérico do personalizado.
    expect(result.current.feed).toEqual({
      items: [detalhe('r1'), detalhe('r2')],
      page: 1,
      pageSize: 20,
      total: 2,
    });
  });

  it('logado com categoria usa o feed da categoria', async () => {
    vi.mocked(getFeedWithDetails).mockResolvedValue(feedPage(['1']));

    const { result } = renderHook(() => useHomeFeed(true, 'Acessórios'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getFeedWithDetails).toHaveBeenCalledWith({ category: 'Acessórios' });
    expect(getRecommendationsWithDetails).not.toHaveBeenCalled();
  });

  // RN-38: recomendação nunca vira erro para o usuário.
  it('recomendação que falha cai no feed, sem erro', async () => {
    vi.mocked(getRecommendationsWithDetails).mockRejectedValue(new Error('500'));
    vi.mocked(getFeedWithDetails).mockResolvedValue(feedPage(['1']));

    const { result } = renderHook(() => useHomeFeed(true, undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(ids(result.current.feed)).toEqual(['1']);
    expect(getFeedWithDetails).toHaveBeenCalledWith();
  });

  it('erro só quando recomendação e feed falham', async () => {
    vi.mocked(getRecommendationsWithDetails).mockRejectedValue(new Error('500'));
    vi.mocked(getFeedWithDetails).mockRejectedValue(new Error('500'));

    const { result } = renderHook(() => useHomeFeed(true, undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.feed).toBeNull();
  });

  it('"carregar mais" no modo recomendação pede a próxima página e concatena', async () => {
    vi.mocked(getRecommendationsWithDetails)
      .mockResolvedValueOnce(recs(['r1'], 1, 2))
      .mockResolvedValueOnce(recs(['r2'], 2, 2));

    const { result } = renderHook(() => useHomeFeed(true, undefined));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(() => result.current.loadMore());

    expect(getRecommendationsWithDetails).toHaveBeenLastCalledWith(2);
    expect(ids(result.current.feed)).toEqual(['r1', 'r2']);
    expect(result.current.hasMore).toBe(false);
    expect(getFeedWithDetails).not.toHaveBeenCalled();
  });

  it('se a primeira página caiu no feed, "carregar mais" continua no feed', async () => {
    vi.mocked(getRecommendationsWithDetails).mockRejectedValue(new Error('500'));
    vi.mocked(getFeedWithDetails)
      .mockResolvedValueOnce(feedPage(['1'], 1, 2))
      .mockResolvedValueOnce(feedPage(['2'], 2, 2));

    const { result } = renderHook(() => useHomeFeed(true, undefined));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(() => result.current.loadMore());

    expect(getFeedWithDetails).toHaveBeenLastCalledWith({ page: 2 });
    expect(getRecommendationsWithDetails).toHaveBeenCalledTimes(1);
    expect(ids(result.current.feed)).toEqual(['1', '2']);
  });

  it('"carregar mais" com categoria mantém a categoria', async () => {
    vi.mocked(getFeedWithDetails)
      .mockResolvedValueOnce(feedPage(['1'], 1, 2))
      .mockResolvedValueOnce(feedPage(['2'], 2, 2));

    const { result } = renderHook(() => useHomeFeed(false, 'Roupas'));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(() => result.current.loadMore());

    expect(getFeedWithDetails).toHaveBeenLastCalledWith({ page: 2, category: 'Roupas' });
  });

  it('falha no "carregar mais" mantém os itens e sinaliza erro', async () => {
    vi.mocked(getRecommendationsWithDetails)
      .mockResolvedValueOnce(recs(['r1'], 1, 2))
      .mockRejectedValueOnce(new Error('500'));

    const { result } = renderHook(() => useHomeFeed(true, undefined));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(() => result.current.loadMore());

    expect(result.current.error).toBe(true);
    expect(ids(result.current.feed)).toEqual(['r1']);
    expect(result.current.hasItems).toBe(true);
  });

  // Sessão restaurada com a Home já montada: a fonte muda no meio da requisição.
  it('descarta a resposta velha quando a fonte muda durante a requisição', async () => {
    const feedAtrasado = deferred<Paginated<ProductDetail>>();
    vi.mocked(getFeedWithDetails).mockReturnValueOnce(feedAtrasado.promise);
    vi.mocked(getRecommendationsWithDetails).mockResolvedValue(recs(['r1']));

    const { result, rerender } = renderHook(({ auth }) => useHomeFeed(auth, undefined), {
      initialProps: { auth: false },
    });
    rerender({ auth: true });
    await waitFor(() => expect(ids(result.current.feed)).toEqual(['r1']));

    await act(async () => feedAtrasado.resolve(feedPage(['velho'])));

    expect(ids(result.current.feed)).toEqual(['r1']);
    expect(result.current.loading).toBe(false);
  });

  it('reload recarrega pela fonte atual', async () => {
    vi.mocked(getRecommendationsWithDetails)
      .mockRejectedValueOnce(new Error('500'))
      .mockResolvedValueOnce(recs(['r1']));
    vi.mocked(getFeedWithDetails).mockRejectedValueOnce(new Error('500'));

    const { result } = renderHook(() => useHomeFeed(true, undefined));
    await waitFor(() => expect(result.current.error).toBe(true));

    act(() => result.current.reload());

    await waitFor(() => expect(ids(result.current.feed)).toEqual(['r1']));
    expect(result.current.error).toBe(false);
  });
});
