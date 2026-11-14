import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { listMyOrders } from '@/services/orderService';
import type { OrderSummary } from '@/types/order';
import type { Paginated } from '@/types/product';
import { useMyOrders } from './useMyOrders';

vi.mock('@/services/orderService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/orderService')>()),
  listMyOrders: vi.fn(),
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

function wrapper({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={AUTH}>{children}</AuthContext.Provider>;
}

function pedido(id: string, overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id,
    store: { id: '5', name: 'Baú da Vó Nair' },
    items: [{ productId: '5', name: 'Calça jeans reta', price: 119.9, coverImageUrl: null }],
    totalAmount: 119.9,
    status: 'confirmado',
    payment: { status: 'aprovado', receiptName: 'pix.pdf' },
    createdAt: '2026-10-20T12:00:00.000Z',
    ...overrides,
  };
}

function pagina(items: OrderSummary[], page: number, total: number): Paginated<OrderSummary> {
  return { items, page, pageSize: 20, total };
}

/** Promise controlada de fora, para decidir a ordem em que as consultas voltam. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

describe('useMyOrders', () => {
  beforeEach(() => {
    vi.mocked(listMyOrders).mockReset();
  });

  it('começa carregando e termina com a primeira página do usuário logado', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(pagina([pedido('a')], 1, 1));

    const { result } = renderHook(() => useMyOrders(), { wrapper });

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(listMyOrders).toHaveBeenCalledWith('u_1', 1);
    expect(result.current.entries.map((entry) => entry.order.id)).toEqual(['a']);
    expect(result.current.hasMore).toBe(false);
  });

  // Mesma regra do detalhe (deriveOrderView), não uma cópia.
  it('deriva a ação de pagamento de cada Pedido', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(
      pagina(
        [
          pedido('aguardando', { status: 'aguardando_comprovante', payment: null }),
          pedido('recusado', {
            status: 'aguardando_comprovante',
            payment: { status: 'rejeitado', rejectionReason: 'Valor errado' },
          }),
          pedido('expirado', { status: 'expirado', payment: null }),
          pedido('confirmado'),
        ],
        1,
        4,
      ),
    );

    const { result } = renderHook(() => useMyOrders(), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    expect(result.current.entries.map((entry) => entry.paymentAction)).toEqual([
      'send',
      'resend',
      null,
      null,
    ]);
  });

  it('"carregar mais" acrescenta a próxima página e para quando acaba', async () => {
    vi.mocked(listMyOrders)
      .mockResolvedValueOnce(pagina([pedido('a'), pedido('b')], 1, 3))
      .mockResolvedValueOnce(pagina([pedido('c')], 2, 3));

    const { result } = renderHook(() => useMyOrders(), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(async () => result.current.loadMore());

    expect(listMyOrders).toHaveBeenLastCalledWith('u_1', 2);
    expect(result.current.entries.map((entry) => entry.order.id)).toEqual(['a', 'b', 'c']);
    expect(result.current.hasMore).toBe(false);
  });

  it('falha no "carregar mais" mantém a lista e sinaliza o erro', async () => {
    vi.mocked(listMyOrders)
      .mockResolvedValueOnce(pagina([pedido('a')], 1, 2))
      .mockRejectedValueOnce(new Error('rede fora'));

    const { result } = renderHook(() => useMyOrders(), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    await act(async () => result.current.loadMore());

    expect(result.current.state.status).toBe('ready');
    expect(result.current.entries.map((entry) => entry.order.id)).toEqual(['a']);
    expect(result.current.loadMoreError).toBe(true);
    expect(result.current.hasMore).toBe(true);
  });

  it('não dispara duas consultas de "carregar mais" ao mesmo tempo', async () => {
    const segunda = deferred<Paginated<OrderSummary>>();
    vi.mocked(listMyOrders)
      .mockResolvedValueOnce(pagina([pedido('a')], 1, 2))
      .mockReturnValueOnce(segunda.promise);

    const { result } = renderHook(() => useMyOrders(), { wrapper });
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => {
      void result.current.loadMore();
      void result.current.loadMore();
    });
    expect(result.current.loadingMore).toBe(true);

    await act(async () => segunda.resolve(pagina([pedido('b')], 2, 2)));

    expect(listMyOrders).toHaveBeenCalledTimes(2);
    expect(result.current.loadingMore).toBe(false);
  });

  it('falha na primeira carga vira erro, e retry recarrega do começo', async () => {
    vi.mocked(listMyOrders)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValueOnce(pagina([pedido('a')], 1, 1));

    const { result } = renderHook(() => useMyOrders(), { wrapper });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error' }));

    act(() => result.current.retry());

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(listMyOrders).toHaveBeenLastCalledWith('u_1', 1);
  });

  it('lista vazia termina pronta, sem itens e sem "carregar mais"', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(pagina([], 1, 0));

    const { result } = renderHook(() => useMyOrders(), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    expect(result.current.entries).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  it('descarta a resposta velha quando o retry já voltou', async () => {
    const primeira = deferred<Paginated<OrderSummary>>();
    vi.mocked(listMyOrders)
      .mockReturnValueOnce(primeira.promise)
      .mockResolvedValueOnce(pagina([pedido('novo')], 1, 1));

    const { result } = renderHook(() => useMyOrders(), { wrapper });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => primeira.resolve(pagina([pedido('velho')], 1, 1)));

    expect(result.current.entries.map((entry) => entry.order.id)).toEqual(['novo']);
  });
});
