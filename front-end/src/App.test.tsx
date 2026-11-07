import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import CartBadge from '@/components/layout/CartBadge';
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from '@/context/useAuth';
import { useCart } from '@/context/useCart';
import type { AuthUser } from '@/types/auth';
import type { Cart } from '@/types/cart';

vi.mock('@/services/cartService', () => ({
  getCart: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
}));

/**
 * Troca as rotas por uma sonda que faz o que o cabeçalho (#225) vai fazer:
 * ler `useCart()` e repassar `count` ao `CartBadge`. Se o `CartProvider` não
 * estiver na árvore do `App`, `useCart()` lança e o render falha.
 */
vi.mock('@/routes/AppRoutes', () => ({
  default: function CartProbe() {
    const { count } = useCart();
    return <CartBadge count={count} onClick={() => {}} />;
  },
}));

import { getCart } from '@/services/cartService';
import App from './App';

const mockedGetCart = vi.mocked(getCart);

const SAMPLE_USER: AuthUser = {
  id: 'u_1',
  name: 'Ana Brechó',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

const TWO_ITEMS_CART: Cart = {
  groups: [
    {
      store: { id: '1', name: 'Loja A' },
      items: [
        {
          product: {
            id: '1',
            name: 'Peça 1',
            price: 10,
            coverImageUrl: null,
            store: { id: '1', name: 'Loja A' },
          },
          addedAt: '2026-01-01T00:00:00Z',
        },
        {
          product: {
            id: '2',
            name: 'Peça 2',
            price: 20,
            coverImageUrl: null,
            store: { id: '1', name: 'Loja A' },
          },
          addedAt: '2026-01-01T00:00:00Z',
        },
      ],
      subtotalCents: 3000,
    },
  ],
};

describe('<App />', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('monta o CartProvider: useCart() funciona sem sessão e não busca o carrinho', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: 'Carrinho, 0 itens' })).toBeInTheDocument();
    expect(mockedGetCart).not.toHaveBeenCalled();
  });

  it('com sessão restaurada, carrega o carrinho e o badge mostra a contagem', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
    mockedGetCart.mockResolvedValue(TWO_ITEMS_CART);

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Carrinho, 2 itens' })).toBeInTheDocument();
    expect(mockedGetCart).toHaveBeenCalledWith(SAMPLE_USER.id);
  });
});
