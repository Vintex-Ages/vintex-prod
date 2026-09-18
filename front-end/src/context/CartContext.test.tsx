import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/useAuth';
import { useCart } from './useCart';
import type { AuthUser } from '@/types/auth';
import type { Cart } from '@/types/cart';

vi.mock('@/services/cartService', () => ({
  getCart: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
}));
import { addItem, getCart, removeItem } from '@/services/cartService';
import { CartProvider } from './CartContext';

const mockedGetCart = vi.mocked(getCart);
const mockedAddItem = vi.mocked(addItem);
const mockedRemoveItem = vi.mocked(removeItem);

const SAMPLE_USER: AuthUser = {
  id: 'u_1',
  name: 'Ana Brechó',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

const EMPTY_CART: Cart = { groups: [] };

const SAMPLE_CART: Cart = {
  groups: [
    {
      store: { id: '1', name: 'Loja A' },
      items: [
        { product: { id: '1', name: 'Peça 1', price: 10, coverImageUrl: null, store: { id: '1', name: 'Loja A' } }, addedAt: '2026-01-01T00:00:00Z' },
        { product: { id: '2', name: 'Peça 2', price: 20, coverImageUrl: null, store: { id: '1', name: 'Loja A' } }, addedAt: '2026-01-01T00:00:00Z' },
      ],
      subtotalCents: 3000,
    },
    {
      store: { id: '2', name: 'Loja B' },
      items: [
        { product: { id: '3', name: 'Peça 3', price: 5, coverImageUrl: null, store: { id: '2', name: 'Loja B' } }, addedAt: '2026-01-01T00:00:00Z' },
      ],
      subtotalCents: 500,
    },
  ],
};

function Probe() {
  const { login, logout } = useAuth();
  const { cart, count, loading, add, remove } = useCart();

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="groups">{cart ? cart.groups.length : 'null'}</span>
      <span data-testid="count">{count}</span>
      <button onClick={() => login(SAMPLE_USER, 'tok-1')}>entrar</button>
      <button onClick={() => logout()}>sair</button>
      <button onClick={() => void add('1')}>add</button>
      <button onClick={() => void remove('1')}>remove</button>
    </div>
  );
}

function renderApp() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <CartProvider>
          <Probe />
        </CartProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('CartContext', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    mockedGetCart.mockResolvedValue(EMPTY_CART);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('anonimo: cart fica null, getCart nao e chamado', async () => {
    renderApp();

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('groups')).toHaveTextContent('null');
    expect(mockedGetCart).not.toHaveBeenCalled();
  });

  it('ao logar, carrega o carrinho automaticamente', async () => {
    mockedGetCart.mockResolvedValue(SAMPLE_CART);
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));

    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('2'));
    expect(screen.getByTestId('count')).toHaveTextContent('3');
    expect(mockedGetCart).toHaveBeenCalled();
  });

  it('ao deslogar, o carrinho volta a null', async () => {
    mockedGetCart.mockResolvedValue(SAMPLE_CART);
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('2'));

    fireEvent.click(screen.getByRole('button', { name: 'sair' }));

    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('null'));
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('add() chama cartService.addItem e atualiza o carrinho com o resultado', async () => {
    mockedAddItem.mockResolvedValue(SAMPLE_CART);
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('0'));

    fireEvent.click(screen.getByRole('button', { name: 'add' }));

    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('2'));
    expect(mockedAddItem).toHaveBeenCalledWith('1');
  });

  it('remove() chama cartService.removeItem e atualiza o carrinho com o resultado', async () => {
    mockedGetCart.mockResolvedValue(SAMPLE_CART);
    mockedRemoveItem.mockResolvedValue(EMPTY_CART);
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('2'));

    fireEvent.click(screen.getByRole('button', { name: 'remove' }));

    await waitFor(() => expect(screen.getByTestId('groups')).toHaveTextContent('0'));
    expect(mockedRemoveItem).toHaveBeenCalledWith('1');
  });

  it('useCart() lanca erro claro quando usado fora do CartProvider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const swallow = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', swallow);

    function Lonely() {
      useCart();
      return null;
    }

    try {
      expect(() => render(<Lonely />)).toThrow(/useCart.*<CartProvider>/);
    } finally {
      window.removeEventListener('error', swallow);
      errorSpy.mockRestore();
    }
  });
});
