import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminReceiptError, listReceipts } from '@/services/adminReceiptService';
import { useReceiptQueue } from './useReceiptQueue';
import type { ReceiptReview } from '@/types/admin';

/**
 * Fixture de testes da fila de comprovantes (FE-US032-1). Só para testes:
 * `review({ orderId: '7', payment: { status: 'aprovado' } })`.
 */
function review(
  overrides: Partial<Omit<ReceiptReview, 'payment'>> & {
    payment?: Partial<ReceiptReview['payment']>;
  } = {},
): ReceiptReview {
  const { payment, ...rest } = overrides;
  return {
    orderId: '8921',
    buyer: { name: 'Ana Compradora', email: 'ana@exemplo.com' },
    store: { id: 's1', name: 'Brechó da Bia', pixKey: null },
    items: [
      {
        productId: '1',
        name: 'Jaqueta jeans',
        price: 159.9,
        coverImageUrl: null,
      },
    ],
    totalAmount: 159.9,
    platformFee: 14.39,
    sellerNetAmount: 145.51,
    ...rest,
    payment: {
      status: 'pendente',
      receiptUrl: '/api/admin/payments/8921/receipt',
      receiptType: 'image',
      submittedAt: '2026-10-01T10:00:00.000Z',
      ...payment,
    },
  };
}

vi.mock('@/services/adminReceiptService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/adminReceiptService')>()),
  listReceipts: vi.fn(),
}));

const page = (items = [review()]) => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
});

beforeEach(() => {
  vi.mocked(listReceipts).mockReset().mockResolvedValue(page());
});

afterEach(cleanup);

describe('useReceiptQueue', () => {
  it('começa carregando e termina com os comprovantes (filtro Todos, sem status)', async () => {
    const { result } = renderHook(() => useReceiptQueue());

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'ready',
        items: [review()],
      }),
    );
    expect(listReceipts).toHaveBeenCalledWith({
      status: undefined,
      q: undefined,
    });
  });

  it('filtro Pendentes consulta o service com status=pendente', async () => {
    const { result } = renderHook(() => useReceiptQueue());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    act(() => result.current.setFilter('pendente'));

    await waitFor(() =>
      expect(listReceipts).toHaveBeenLastCalledWith({
        status: 'pendente',
        q: undefined,
      }),
    );
    expect(result.current.filter).toBe('pendente');
  });

  it('busca envia o termo aparado em q', async () => {
    const { result } = renderHook(() => useReceiptQueue());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    act(() => result.current.search('  ana '));

    await waitFor(() =>
      expect(listReceipts).toHaveBeenLastCalledWith({
        status: undefined,
        q: 'ana',
      }),
    );
  });

  it('403 vira forbidden', async () => {
    vi.mocked(listReceipts).mockRejectedValue(new AdminReceiptError('FORBIDDEN', 'sem permissão'));

    const { result } = renderHook(() => useReceiptQueue());

    await waitFor(() => expect(result.current.state).toEqual({ status: 'forbidden' }));
  });

  it('outro erro vira error e retry consulta de novo', async () => {
    vi.mocked(listReceipts).mockRejectedValueOnce(new Error('rede'));
    const { result } = renderHook(() => useReceiptQueue());
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(listReceipts).toHaveBeenCalledTimes(2);
  });

  it('descarta a resposta de uma consulta que ficou velha', async () => {
    let resolveFirst!: (value: ReturnType<typeof page>) => void;
    vi.mocked(listReceipts)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(page([review({ orderId: 'novo' })]));
    const { result } = renderHook(() => useReceiptQueue());

    act(() => result.current.setFilter('aprovado'));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => resolveFirst(page([review({ orderId: 'velho' })])));

    expect(result.current.state).toEqual({
      status: 'ready',
      items: [review({ orderId: 'novo' })],
    });
  });

  // Repetir a mesma busca/filtro não muda a consulta: não pode travar em "carregando".
  it('repetir a mesma busca ou o mesmo filtro não deixa a fila carregando', async () => {
    const { result } = renderHook(() => useReceiptQueue());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    act(() => result.current.search('lala'));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    act(() => result.current.search('  lala '));
    expect(result.current.state.status).toBe('ready');

    act(() => result.current.setFilter('todos'));
    expect(result.current.state.status).toBe('ready');
  });
});
