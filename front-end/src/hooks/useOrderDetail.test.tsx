import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { getOrder, OrderError } from '@/services/orderService';
import type { Order } from '@/types/order';
import { useOrderDetail } from './useOrderDetail';

vi.mock('@/services/orderService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/orderService')>()),
  getOrder: vi.fn(),
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

const ORDER: Order = {
  id: 'ped-1',
  store: { id: '5', name: 'Baú da Vó Nair', pixKey: 'bau@vintex.com' },
  items: [{ productId: '5', name: 'Calça jeans reta', price: 119.9, coverImageUrl: null }],
  productAmount: 119.9,
  platformFee: 10.79,
  totalAmount: 119.9,
  status: 'aguardando_comprovante',
  history: [{ status: 'aguardando_comprovante', at: '2026-10-20T12:00:00.000Z' }],
  deliveryAddress: {
    zipCode: '90010-000',
    street: 'Rua dos Andradas',
    number: '500',
    neighborhood: 'Centro Histórico',
    city: 'Porto Alegre',
    state: 'RS',
  },
  payment: null,
  createdAt: '2026-10-20T12:00:00.000Z',
  expiresAt: '2026-10-23T12:00:00.000Z',
};

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useOrderDetail', () => {
  beforeEach(() => {
    vi.mocked(getOrder).mockReset();
  });

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('busca o Pedido do usuário logado e termina pronto', async () => {
    vi.mocked(getOrder).mockResolvedValue(ORDER);

    const { result } = renderHook(() => useOrderDetail('ped-1'), { wrapper });

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', order: ORDER }));
    expect(getOrder).toHaveBeenCalledWith('u_1', 'ped-1');
  });

  it('Pedido inexistente ou de outro usuário vira erro "não encontrado", sem tentar de novo', async () => {
    vi.mocked(getOrder).mockRejectedValue(new OrderError('ORDER_NOT_FOUND', 'não encontrado'));

    const { result } = renderHook(() => useOrderDetail('ped-x'), { wrapper });

    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', notFound: true }));
  });

  it('outra falha vira erro genérico, e reload tenta de novo', async () => {
    vi.mocked(getOrder).mockRejectedValueOnce(new Error('rede fora')).mockResolvedValue(ORDER);

    const { result } = renderHook(() => useOrderDetail('ped-1'), { wrapper });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', notFound: false }));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', order: ORDER }));
  });

  // A situação muda fora da tela (admin, simulação): voltar à aba relê.
  it('recarrega quando a aba volta a ficar visível, sem voltar para "carregando"', async () => {
    const confirmado: Order = { ...ORDER, status: 'confirmado' };
    vi.mocked(getOrder).mockResolvedValueOnce(ORDER).mockResolvedValueOnce(confirmado);

    const { result } = renderHook(() => useOrderDetail('ped-1'), { wrapper });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', order: ORDER }));

    act(() => setVisibility('hidden'));
    expect(getOrder).toHaveBeenCalledTimes(1);

    act(() => setVisibility('visible'));
    expect(result.current.state.status).toBe('ready');

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', order: confirmado }),
    );
    expect(getOrder).toHaveBeenCalledTimes(2);
  });

  it('falha na recarga em segundo plano mantém o Pedido que já estava na tela', async () => {
    vi.mocked(getOrder).mockResolvedValueOnce(ORDER).mockRejectedValueOnce(new Error('rede fora'));

    const { result } = renderHook(() => useOrderDetail('ped-1'), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    act(() => setVisibility('visible'));

    await waitFor(() => expect(getOrder).toHaveBeenCalledTimes(2));
    expect(result.current.state).toEqual({ status: 'ready', order: ORDER });
  });

  it('remove o listener ao desmontar', async () => {
    vi.mocked(getOrder).mockResolvedValue(ORDER);
    const remove = vi.spyOn(document, 'removeEventListener');

    const { result, unmount } = renderHook(() => useOrderDetail('ped-1'), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    unmount();

    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    act(() => setVisibility('visible'));
    expect(getOrder).toHaveBeenCalledTimes(1);
    remove.mockRestore();
  });

  it('descarta a resposta velha quando outra consulta já voltou', async () => {
    let resolverPrimeira!: (order: Order) => void;
    const confirmado: Order = { ...ORDER, status: 'confirmado' };
    vi.mocked(getOrder)
      .mockReturnValueOnce(new Promise((resolve) => (resolverPrimeira = resolve)))
      .mockResolvedValueOnce(confirmado);

    const { result } = renderHook(() => useOrderDetail('ped-1'), { wrapper });
    act(() => result.current.reload());
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', order: confirmado }),
    );

    await act(async () => resolverPrimeira(ORDER));

    expect(result.current.state).toEqual({ status: 'ready', order: confirmado });
  });
});
