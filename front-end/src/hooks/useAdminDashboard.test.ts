import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminDashboardError, getDashboard } from '@/services/dashboardService';
import type { AdminDashboard } from '@/types/dashboard';
import { useAdminDashboard } from './useAdminDashboard';

vi.mock('@/services/dashboardService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/dashboardService')>()),
  getDashboard: vi.fn(),
}));

const DASHBOARD: AdminDashboard = {
  storesCount: 7,
  usersCount: 120,
  activeProductsCount: 1284,
  salesVolume: 128450,
  commissionTotal: 11560.5,
  salesByStore: [
    { storeId: '1', storeName: 'Brechó Linha do Tempo', amount: 18240 },
    { storeId: '2', storeName: 'Garimpo da Praça', amount: 14820 },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(getDashboard).mockReset();
});

describe('useAdminDashboard', () => {
  it('começa carregando e fica pronto com o painel do service, sem mexer nos números', async () => {
    vi.mocked(getDashboard).mockResolvedValue(DASHBOARD);

    const { result } = renderHook(() => useAdminDashboard());

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(result.current.state).toEqual({ status: 'ready', dashboard: DASHBOARD });
    expect(getDashboard).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['erro genérico', new Error('rede')],
    ['403 do back', new AdminDashboardError('FORBIDDEN', 'sem permissão')],
  ])('%s vira error', async (_caso, erro) => {
    vi.mocked(getDashboard).mockRejectedValue(erro);

    const { result } = renderHook(() => useAdminDashboard());

    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));
  });

  it('retry passa por loading e busca de novo', async () => {
    vi.mocked(getDashboard).mockRejectedValueOnce(new Error('rede'));
    const { result } = renderHook(() => useAdminDashboard());
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    const request = deferred<AdminDashboard>();
    vi.mocked(getDashboard).mockReturnValueOnce(request.promise);
    act(() => result.current.retry());

    expect(result.current.state).toEqual({ status: 'loading' });
    await act(async () => request.resolve(DASHBOARD));
    expect(result.current.state).toEqual({ status: 'ready', dashboard: DASHBOARD });
    expect(getDashboard).toHaveBeenCalledTimes(2);
  });

  it('resposta que ficou velha é descartada', async () => {
    const first = deferred<AdminDashboard>();
    vi.mocked(getDashboard).mockReturnValueOnce(first.promise);
    const { result } = renderHook(() => useAdminDashboard());

    const second = deferred<AdminDashboard>();
    vi.mocked(getDashboard).mockReturnValueOnce(second.promise);
    act(() => result.current.retry());

    await act(async () => second.resolve(DASHBOARD));
    await act(async () => first.resolve({ ...DASHBOARD, storesCount: 999 }));

    expect(result.current.state).toEqual({ status: 'ready', dashboard: DASHBOARD });
  });

  it('desmontado, a resposta pendente não escreve', async () => {
    const request = deferred<AdminDashboard>();
    vi.mocked(getDashboard).mockReturnValueOnce(request.promise);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHook(() => useAdminDashboard());

    unmount();
    await act(async () => request.resolve(DASHBOARD));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
