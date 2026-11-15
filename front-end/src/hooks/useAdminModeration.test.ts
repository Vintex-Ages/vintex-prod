import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminModerationError,
  listSuspended,
  restoreProduct,
} from '@/services/adminModerationService';
import type {
  ListSuspendedParams,
  ModerationResult,
  SuspendedProduct,
} from '@/types/adminModeration';
import type { Paginated } from '@/types/product';
import { useAdminModeration } from './useAdminModeration';

vi.mock('@/services/adminModerationService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/adminModerationService')>()),
  listSuspended: vi.fn(),
  restoreProduct: vi.fn(),
}));

// RED #414. Apenas a API pública proposta do hook; sem impor cache ou
// sequência interna de refetch. O import ausente impede coletar esta suíte.
interface ModerationView {
  state: { status: 'loading' | 'ready' | 'error' | 'forbidden' };
  items: SuspendedProduct[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
  reconcileError: boolean;
  restoringIds: ReadonlySet<string>;
  restoreErrors: Record<string, string>;
  retry: () => void;
  loadMore: () => Promise<unknown>;
  restore: (id: string) => Promise<ModerationResult | null>;
}

function product(id: string): SuspendedProduct {
  return {
    id,
    name: `Peça ${id}`,
    price: 90,
    status: 'despublicado',
    coverImageUrl: null,
    store: { id: '414-store', name: 'Brechó do teste' },
    moderationReason: 'Imagem incorreta.',
    moderatedAt: '2026-11-14T12:00:00',
  };
}

function page(
  items: SuspendedProduct[],
  number = 1,
  total = items.length,
): Paginated<SuspendedProduct> {
  return { items, page: number, pageSize: 20, total };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderSubject() {
  return renderHook<ModerationView, void>(useAdminModeration);
}

function ids(view: ModerationView) {
  return view.items.map(({ id }) => id);
}

/** Backend paginado simulado só nos limites do teste, com offsets reais. */
function dataset(size: number) {
  let records = Array.from({ length: size }, (_, index) => product(String(index + 1)));
  vi.mocked(listSuspended).mockImplementation(async (params: ListSuspendedParams = {}) => {
    const number = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    return {
      items: records.slice((number - 1) * pageSize, number * pageSize),
      page: number,
      pageSize,
      total: records.length,
    };
  });
  vi.mocked(restoreProduct).mockImplementation(async (id) => {
    records = records.filter((item) => item.id !== id);
    return { productId: id, status: 'ativo' };
  });
}

beforeEach(() => {
  vi.mocked(listSuspended).mockReset();
  vi.mocked(restoreProduct).mockReset();
});
afterEach(cleanup);

describe('useAdminModeration — RED #414', () => {
  it('começa carregando e consulta página e pageSize explícitos, sem reordenar', async () => {
    const pending = deferred<Paginated<SuspendedProduct>>();
    vi.mocked(listSuspended).mockReturnValue(pending.promise);
    const { result } = renderSubject();
    expect(result.current.state.status).toBe('loading');
    expect(listSuspended).toHaveBeenCalledExactlyOnceWith({ page: 1, pageSize: 20 });
    await act(async () => pending.resolve(page([product('9'), product('2')], 1, 22)));
    expect(ids(result.current)).toEqual(['9', '2']);
    expect(result.current.total).toBe(22);
    expect(result.current.hasMore).toBe(true);
  });

  it('lista vazia chega a ready com total zero e sem próxima página', async () => {
    vi.mocked(listSuspended).mockResolvedValue(page([]));
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.hasMore).toBe(false);
  });

  it('erro inicial pode ser recuperado por retry', async () => {
    vi.mocked(listSuspended)
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce(page([product('1')]));
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(ids(result.current)).toEqual(['1']);
    expect(listSuspended).toHaveBeenCalledTimes(2);
  });

  it('403 é distinguido de uma falha recuperável de rede', async () => {
    vi.mocked(listSuspended).mockRejectedValue(
      new AdminModerationError('FORBIDDEN', 'Sem permissão.', 403, 'ADMIN_REQUIRED'),
    );
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.state.status).toBe('forbidden'));
  });

  it('carrega mais, preserva ordem e para no total recebido', async () => {
    dataset(22);
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(20));
    await act(() => result.current.loadMore());
    expect(listSuspended).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 });
    expect(ids(result.current)).toEqual(Array.from({ length: 22 }, (_, i) => String(i + 1)));
    expect(result.current.total).toBe(22);
    expect(result.current.hasMore).toBe(false);
    const calls = vi.mocked(listSuspended).mock.calls.length;
    await act(() => result.current.loadMore());
    expect(listSuspended).toHaveBeenCalledTimes(calls);
  });

  it('trava dois pedidos de próxima página antes de um novo render', async () => {
    dataset(22);
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(20));
    const pending = deferred<Paginated<SuspendedProduct>>();
    vi.mocked(listSuspended).mockReturnValueOnce(pending.promise);
    act(() => {
      void result.current.loadMore();
      void result.current.loadMore();
    });
    expect(listSuspended).toHaveBeenCalledTimes(2);
    expect(result.current.loadingMore).toBe(true);
    await act(async () => pending.resolve(page([product('21'), product('22')], 2, 22)));
    expect(result.current.items).toHaveLength(22);
  });

  it('falha adicional preserva registros e nova tentativa não pula a página', async () => {
    dataset(22);
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(20));
    vi.mocked(listSuspended).mockRejectedValueOnce(new Error('rede'));
    await act(() => result.current.loadMore());
    expect(result.current.loadMoreError).toBe(true);
    expect(result.current.items).toHaveLength(20);
    expect(result.current.total).toBe(22);
    expect(result.current.loadingMore).toBe(false);
    await act(() => result.current.loadMore());
    expect(listSuspended).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 });
    expect(result.current.items).toHaveLength(22);
    expect(result.current.loadMoreError).toBe(false);
  });

  it('resposta inicial antiga não sobrescreve retry concluído', async () => {
    const old = deferred<Paginated<SuspendedProduct>>();
    vi.mocked(listSuspended)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(page([product('nova')]));
    const { result } = renderSubject();
    act(() => result.current.retry());
    await waitFor(() => expect(ids(result.current)).toEqual(['nova']));
    await act(async () => old.resolve(page([product('velha')])));
    expect(ids(result.current)).toEqual(['nova']);
  });

  it('página adicional antiga não é anexada depois de reiniciar a consulta', async () => {
    dataset(22);
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(20));
    const old = deferred<Paginated<SuspendedProduct>>();
    vi.mocked(listSuspended)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(page([product('nova')]));
    act(() => {
      void result.current.loadMore();
    });
    act(() => result.current.retry());
    await waitFor(() => expect(ids(result.current)).toEqual(['nova']));
    await act(async () => old.resolve(page([product('velha')], 2, 21)));
    expect(ids(result.current)).toEqual(['nova']);
    expect(result.current.total).toBe(1);
  });

  it('restaurar aguarda sucesso, carrega só o item e não remove otimisticamente', async () => {
    dataset(2);
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    const pending = deferred<ModerationResult>();
    vi.mocked(restoreProduct).mockReturnValueOnce(pending.promise);
    act(() => {
      void result.current.restore('1');
    });
    expect(restoreProduct).toHaveBeenCalledExactlyOnceWith('1');
    expect(result.current.restoringIds.has('1')).toBe(true);
    expect(result.current.restoringIds.has('2')).toBe(false);
    expect(ids(result.current)).toEqual(['1', '2']);
    expect(result.current.total).toBe(2);
    vi.mocked(listSuspended).mockResolvedValue(page([product('2')]));
    await act(async () => pending.resolve({ productId: '1', status: 'ativo' }));
    await waitFor(() => expect(ids(result.current)).toEqual(['2']));
    expect(result.current.total).toBe(1);
    expect(result.current.restoringIds.has('1')).toBe(false);
  });

  it('duas restaurações do mesmo ID no mesmo turno fazem uma chamada', async () => {
    dataset(1);
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    const pending = deferred<ModerationResult>();
    vi.mocked(restoreProduct).mockReturnValueOnce(pending.promise);
    act(() => {
      void result.current.restore('1');
      void result.current.restore('1');
    });
    expect(restoreProduct).toHaveBeenCalledTimes(1);
    vi.mocked(listSuspended).mockResolvedValue(page([]));
    await act(async () => pending.resolve({ productId: '1', status: 'ativo' }));
  });

  it('falha mantém item e total, e uma nova tentativa pode restaurar', async () => {
    dataset(2);
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    vi.mocked(restoreProduct).mockRejectedValueOnce(
      new AdminModerationError('NETWORK_ERROR', 'Sem conexão.'),
    );
    await act(() => result.current.restore('1'));
    expect(ids(result.current)).toEqual(['1', '2']);
    expect(result.current.total).toBe(2);
    expect(result.current.restoreErrors['1']).toMatch(/conexão|restaurar|tente novamente/i);
    expect(result.current.restoringIds.size).toBe(0);
    await act(() => result.current.restore('1'));
    await waitFor(() => expect(ids(result.current)).toEqual(['2']));
    expect(result.current.restoreErrors['1']).toBeUndefined();
  });

  it.each([
    new AdminModerationError('NO_IMAGE', 'Dados inválidos.', 422, 'VALIDATION_ERROR', {
      images: 'A peça precisa de ao menos uma foto para voltar.',
    }),
    new AdminModerationError('VALIDATION_ERROR', 'Dados inválidos.', 422, 'VALIDATION_ERROR', {
      images: 'A peça precisa de ao menos uma foto para voltar.',
    }),
  ])('falta de foto é reconhecida por code ou fields.images: %#', async (error) => {
    dataset(1);
    vi.mocked(restoreProduct).mockRejectedValue(error);
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(() => result.current.restore('1'));
    expect(result.current.restoreErrors['1']).toMatch(/ao menos uma foto|pelo menos uma foto/i);
    expect(ids(result.current)).toEqual(['1']);
  });

  it('outro 422 não é apresentado como falta de foto', async () => {
    dataset(1);
    vi.mocked(restoreProduct).mockRejectedValue(
      new AdminModerationError(
        'VALIDATION_ERROR',
        'Os dados da peça precisam ser corrigidos.',
        422,
        'VALIDATION_ERROR',
        { status: 'Estado inválido.' },
      ),
    );
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(() => result.current.restore('1'));
    expect(result.current.restoreErrors['1']).toMatch(/dados|estado/i);
    expect(result.current.restoreErrors['1']).not.toMatch(/foto/i);
    expect(ids(result.current)).toEqual(['1']);
  });

  it.each(['ativo', 'despublicado'] as const)(
    'retorna o resultado %s intacto e remove a suspensão',
    async (status) => {
      dataset(1);
      const { result } = renderSubject();
      await waitFor(() => expect(result.current.items).toHaveLength(1));
      const response: ModerationResult = { productId: '1', status };
      vi.mocked(restoreProduct).mockResolvedValueOnce(response);
      vi.mocked(listSuspended).mockResolvedValue(page([]));
      let restored: ModerationResult | null = null;
      await act(async () => {
        restored = await result.current.restore('1');
      });
      expect(restored).toEqual(response);
      await waitFor(() => expect(result.current.items).toEqual([]));
      expect(result.current.total).toBe(0);
    },
  );

  it('reconcilia offsets depois de restaurar sem duplicar, pular ou perder itens', async () => {
    dataset(42);
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(20));
    await act(() => result.current.loadMore());
    expect(result.current.items).toHaveLength(40);
    await act(() => result.current.restore('1'));
    // Não depende do número de refetches ou de como o hook guarda suas páginas.
    for (let attempt = 0; attempt < 4 && result.current.hasMore; attempt += 1) {
      await act(() => result.current.loadMore());
    }
    await waitFor(() => expect(result.current.total).toBe(41));
    expect(ids(result.current)).toEqual(
      Array.from({ length: 41 }, (_, index) => String(index + 2)),
    );
    expect(new Set(ids(result.current)).size).toBe(41);
    expect(result.current.hasMore).toBe(false);
  });

  it('falha de reconciliação preserva os outros itens carregados e o total após sucesso', async () => {
    dataset(42);
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(20));
    await act(() => result.current.loadMore());
    vi.mocked(listSuspended).mockRejectedValue(new Error('rede durante atualização'));
    await act(() => result.current.restore('1'));
    await waitFor(() => expect(result.current.reconcileError).toBe(true));
    expect(ids(result.current)).toEqual(
      Array.from({ length: 39 }, (_, index) => String(index + 2)),
    );
    expect(result.current.total).toBe(41);
    expect(result.current.restoreErrors['1']).toBeUndefined();
    // Atualizar a lista novamente não repete o POST já confirmado.
    vi.mocked(listSuspended).mockResolvedValue(page([product('2')], 1, 41));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.reconcileError).toBe(false));
    expect(restoreProduct).toHaveBeenCalledTimes(1);
  });

  it('resposta de loadMore anterior à restauração não ressuscita a suspensão', async () => {
    dataset(22);
    const { result } = renderSubject();
    await waitFor(() => expect(result.current.items).toHaveLength(20));
    const old = deferred<Paginated<SuspendedProduct>>();
    vi.mocked(listSuspended).mockReturnValueOnce(old.promise);
    act(() => {
      void result.current.loadMore();
    });
    await act(() => result.current.restore('1'));
    await act(async () => old.resolve(page([product('21'), product('22')], 2, 22)));
    for (let attempt = 0; attempt < 3 && result.current.hasMore; attempt += 1) {
      await act(() => result.current.loadMore());
    }
    expect(result.current.total).toBe(21);
    expect(ids(result.current)).toEqual(Array.from({ length: 21 }, (_, i) => String(i + 2)));
  });
});
