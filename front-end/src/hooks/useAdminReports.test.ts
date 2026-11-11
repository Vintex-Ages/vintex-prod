import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listReports, OrderReportError } from '@/services/reportService';
import type { AdminOrderReport } from '@/types/report';
import type { Paginated } from '@/types/product';
import { useAdminReports } from './useAdminReports';

vi.mock('@/services/reportService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/reportService')>()),
  listReports: vi.fn(),
}));

/** Lista de Reclamações da administradora (FE-US025-2, #427). */

function reclamacao(id: string, overrides: Partial<AdminOrderReport> = {}): AdminOrderReport {
  return {
    id,
    orderId: `ped-${id}`,
    reason: 'danificado',
    description: 'A manga veio rasgada.',
    createdAt: '2026-10-29T14:32:00',
    buyer: { id: 'u_1', name: 'Ana Compradora' },
    store: { id: 's_1', name: 'Brechó da Bia' },
    ...overrides,
  };
}

function pagina(
  items: AdminOrderReport[],
  page = 1,
  total = items.length,
): Paginated<AdminOrderReport> {
  return { items, page, pageSize: 20, total };
}

beforeEach(() => {
  vi.mocked(listReports).mockReset();
});

afterEach(cleanup);

describe('useAdminReports', () => {
  it('começa carregando e traz a primeira página na ordem do service', async () => {
    vi.mocked(listReports).mockResolvedValue(pagina([reclamacao('2'), reclamacao('1')]));
    const { result } = renderHook(() => useAdminReports());

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    expect(listReports).toHaveBeenCalledWith({ page: 1 });
    expect(result.current.reports.map(({ id }) => id)).toEqual(['2', '1']);
    expect(result.current.hasMore).toBe(false);
  });

  it('falha vira error, e retry refaz a consulta', async () => {
    vi.mocked(listReports)
      .mockRejectedValueOnce(new OrderReportError('INTERNAL_ERROR', 'falhou'))
      .mockResolvedValueOnce(pagina([reclamacao('1')]));
    const { result } = renderHook(() => useAdminReports());

    await waitFor(() => expect(result.current.state.status).toBe('error'));
    act(() => result.current.retry());

    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(listReports).toHaveBeenCalledTimes(2);
  });

  it('403 (FORBIDDEN) vira forbidden', async () => {
    vi.mocked(listReports).mockRejectedValue(new OrderReportError('FORBIDDEN', 'sem permissão'));
    const { result } = renderHook(() => useAdminReports());

    await waitFor(() => expect(result.current.state.status).toBe('forbidden'));
  });

  it('loadMore acrescenta a próxima página e hasMore some quando acaba', async () => {
    vi.mocked(listReports)
      .mockResolvedValueOnce(pagina([reclamacao('3'), reclamacao('2')], 1, 3))
      .mockResolvedValueOnce(pagina([reclamacao('1')], 2, 3));
    const { result } = renderHook(() => useAdminReports());
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(() => result.current.loadMore());

    expect(listReports).toHaveBeenLastCalledWith({ page: 2 });
    expect(result.current.reports.map(({ id }) => id)).toEqual(['3', '2', '1']);
    expect(result.current.hasMore).toBe(false);
  });

  it('falha no loadMore não apaga a lista', async () => {
    vi.mocked(listReports)
      .mockResolvedValueOnce(pagina([reclamacao('2')], 1, 2))
      .mockRejectedValueOnce(new Error('rede'));
    const { result } = renderHook(() => useAdminReports());
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(() => result.current.loadMore());

    expect(result.current.loadMoreError).toBe(true);
    expect(result.current.state.status).toBe('ready');
    expect(result.current.reports.map(({ id }) => id)).toEqual(['2']);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.loadingMore).toBe(false);
  });

  it('descarta a resposta de uma consulta que ficou velha', async () => {
    let resolveFirst: (value: Paginated<AdminOrderReport>) => void = () => {};
    vi.mocked(listReports)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(pagina([reclamacao('nova')]));
    const { result } = renderHook(() => useAdminReports());

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => resolveFirst(pagina([reclamacao('velha')])));

    expect(result.current.reports.map(({ id }) => id)).toEqual(['nova']);
  });
});
