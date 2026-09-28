import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMyStore } from '@/services/storeService';
import type { StoreProfile } from '@/types/store';
import { useMyStore } from './useMyStore';

vi.mock('@/services/storeService', () => ({ getMyStore: vi.fn() }));

const STORE: StoreProfile = {
  id: 'store-1',
  name: 'Brechó da Ana',
  description: 'Peças garimpadas.',
  logoUrl: null,
  city: 'Porto Alegre',
  state: 'RS',
  verification: 'pendente',
  createdAt: '2026-09-01T00:00:00.000Z',
};

/** Promise controlada de fora, pra decidir a ordem em que as consultas voltam. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useMyStore', () => {
  beforeEach(() => {
    vi.mocked(getMyStore).mockReset();
  });

  it('começa carregando e termina com a loja', async () => {
    vi.mocked(getMyStore).mockResolvedValue(STORE);

    const { result } = renderHook(() => useMyStore());

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', store: STORE }));
  });

  it('descarta a resposta de uma consulta que ficou velha depois do retry', async () => {
    const first = deferred<StoreProfile | null>();
    const second = deferred<StoreProfile | null>();
    vi.mocked(getMyStore).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useMyStore());
    act(() => result.current.retry());

    await act(async () => {
      second.resolve(STORE);
      first.resolve(null);
    });

    expect(result.current.state).toEqual({ status: 'ready', store: STORE });
  });

  it('descarta um erro que chega depois de desmontar', async () => {
    const pending = deferred<StoreProfile | null>();
    vi.mocked(getMyStore).mockReturnValue(pending.promise);

    const { result, unmount } = renderHook(() => useMyStore());
    unmount();

    await act(async () => {
      pending.reject(new Error('rede'));
    });

    expect(result.current.state).toEqual({ status: 'loading' });
  });
});
