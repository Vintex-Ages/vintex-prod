import { useCallback, useRef, useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/context/ToastContext';
import { CartContext, type CartContextValue } from '@/context/useCart';
import type { ApiError } from '@/types/auth';
import type { Cart as CartModel, CartGroup, CartItem } from '@/types/cart';
import CartPage from './Cart';

const ANA = { id: 'loja-ana', name: 'Brechó da Ana' };
const BIA = { id: 'loja-bia', name: 'Brechó da Bia' };

function item(id: string, name: string, price: number, store = ANA, unavailable = false): CartItem {
  return {
    product: { id, name, price, coverImageUrl: null, store },
    unavailable,
  };
}

/** Grupo como o service devolve: subtotal só das disponíveis, em centavos. */
function group(store: typeof ANA, items: CartItem[]): CartGroup {
  return {
    store,
    items,
    subtotalCents: items
      .filter((entry) => !entry.unavailable)
      .reduce((total, entry) => total + Math.round(entry.product.price * 100), 0),
  };
}

type Spies = { remove: (productId: string) => void; refresh: () => void };

type Setup = {
  initial: CartModel | null;
  refreshError?: ApiError;
  removeFails?: boolean;
};

/**
 * Carrinho em memória no lugar do `CartProvider`: `remove` tira o item do
 * grupo (como o back faz) e `refresh` pode falhar uma vez.
 */
function FakeCartProvider({
  initial,
  refreshError,
  removeFails,
  spies,
  children,
}: Setup & {
  spies: Spies;
  children: React.ReactNode;
}) {
  const [cart, setCart] = useState<CartModel | null>(refreshError ? null : initial);
  const [error, setError] = useState<ApiError | null>(null);
  // Ref, não estado: como no `CartProvider`, `refresh` não muda de identidade.
  const failedRef = useRef(false);

  const refresh = useCallback(async () => {
    spies.refresh();
    if (refreshError && !failedRef.current) {
      failedRef.current = true;
      setError(refreshError);
      return;
    }
    setError(null);
    setCart((current) => current ?? initial);
  }, [initial, refreshError, spies]);

  const remove = useCallback(
    async (productId: string) => {
      spies.remove(productId);
      if (removeFails) throw new Error('fora do ar');
      setCart((current) =>
        current
          ? {
              groups: current.groups
                .map((entry) =>
                  group(
                    entry.store,
                    entry.items.filter((cartItem) => cartItem.product.id !== productId),
                  ),
                )
                .filter((entry) => entry.items.length > 0),
            }
          : current,
      );
    },
    [removeFails, spies],
  );

  const value: CartContextValue = {
    cart,
    count: cart?.groups.reduce((total, entry) => total + entry.items.length, 0) ?? 0,
    loading: false,
    error,
    add: async () => {},
    remove,
    refresh,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function renderCart(setup: Setup) {
  const spies = { remove: vi.fn<(productId: string) => void>(), refresh: vi.fn<() => void>() };
  render(
    <ToastProvider>
      <FakeCartProvider {...setup} spies={spies}>
        <MemoryRouter initialEntries={['/cart']}>
          <Routes>
            <Route path="/cart" element={<CartPage />} />
            <Route path="/catalog" element={<h1>Catálogo</h1>} />
            <Route path="/product/:id" element={<h1>Detalhe da peça</h1>} />
          </Routes>
        </MemoryRouter>
      </FakeCartProvider>
    </ToastProvider>,
  );
  return spies;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('<Cart />', () => {
  it('recarrega o carrinho ao abrir e agrupa por brechó, com subtotal por loja', async () => {
    const spies = renderCart({
      initial: {
        groups: [
          group(ANA, [item('1', 'Vestido floral', 100), item('2', 'Saia midi', 50)]),
          group(BIA, [item('3', 'Bota Chelsea', 80, BIA)]),
        ],
      },
    });

    expect(spies.refresh).toHaveBeenCalled();
    const ana = within(await screen.findByRole('region', { name: 'Brechó da Ana' }));
    expect(ana.getByText('Vestido floral')).toBeInTheDocument();
    expect(screen.getByTestId('subtotal-loja-ana')).toHaveTextContent('R$ 150,00');
    expect(screen.getByTestId('subtotal-loja-bia')).toHaveTextContent('R$ 80,00');
    // Sem total único somando lojas (RN-18, RN-19).
    expect(screen.queryByText('R$ 230,00')).toBeNull();
  });

  // Objetivo declarado: garantir a gestão do carrinho.
  it('remover item atualiza a lista e o subtotal', async () => {
    const user = userEvent.setup();
    const spies = renderCart({
      initial: {
        groups: [group(ANA, [item('1', 'Vestido floral', 100), item('2', 'Saia midi', 50)])],
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Remover Saia midi do carrinho' }));

    expect(spies.remove).toHaveBeenCalledWith('2');
    await waitFor(() => expect(screen.queryByText('Saia midi')).toBeNull());
    expect(screen.getByTestId('subtotal-loja-ana')).toHaveTextContent('R$ 100,00');
  });

  // Objetivo declarado: garantir "carrinho reflete disponibilidade".
  it('peça vendida gera aviso, sai do carrinho e fica marcada, fora do subtotal', async () => {
    const spies = renderCart({
      initial: {
        groups: [
          group(ANA, [item('1', 'Vestido floral', 100), item('2', 'Saia midi', 50, ANA, true)]),
        ],
      },
    });

    expect(
      await screen.findByText('Saia midi foi vendida e saiu do seu carrinho'),
    ).toBeInTheDocument();
    expect(spies.remove).toHaveBeenCalledWith('2');
    expect(screen.getByText('Vendido')).toBeInTheDocument();
    expect(screen.getByTestId('subtotal-loja-ana')).toHaveTextContent('R$ 100,00');
  });

  it('avisa uma vez só, mesmo que o carrinho recarregue', async () => {
    renderCart({
      initial: { groups: [group(ANA, [item('2', 'Saia midi', 50, ANA, true)])] },
    });

    await screen.findByText('Saia midi foi vendida e saiu do seu carrinho');
    await waitFor(() =>
      expect(screen.getAllByText('Saia midi foi vendida e saiu do seu carrinho')).toHaveLength(1),
    );
  });

  // Objetivo declarado: garantir o estado vazio.
  it('vazio mostra o EmptyState com CTA para o catálogo', async () => {
    const user = userEvent.setup();
    renderCart({ initial: { groups: [] } });

    expect(await screen.findByText('Seu carrinho está vazio')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Explorar o catálogo' }));

    expect(screen.getByRole('heading', { name: 'Catálogo' })).toBeInTheDocument();
  });

  it('Finalizar compra fica desabilitado com a nota de em breve', async () => {
    renderCart({ initial: { groups: [group(ANA, [item('1', 'Vestido floral', 100)])] } });

    const finalizar = await screen.findByRole('button', { name: 'Finalizar compra' });
    expect(finalizar).toBeDisabled();
    expect(finalizar).toHaveAccessibleDescription('Em breve: pagamento por Pix direto ao brechó.');
  });

  it('erro ao carregar mostra ErrorState e tentar de novo recarrega', async () => {
    const user = userEvent.setup();
    const spies = renderCart({
      initial: { groups: [group(ANA, [item('1', 'Vestido floral', 100)])] },
      refreshError: { code: 'API_ERROR', message: 'fora do ar' },
    });

    expect(await screen.findByText('Não foi possível carregar seu carrinho.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Vestido floral')).toBeInTheDocument();
    expect(spies.refresh).toHaveBeenCalledTimes(2);
  });

  it('falha ao remover avisa com erro e mantém a peça', async () => {
    const user = userEvent.setup();
    renderCart({
      initial: { groups: [group(ANA, [item('1', 'Vestido floral', 100)])] },
      removeFails: true,
    });

    await user.click(
      await screen.findByRole('button', { name: 'Remover Vestido floral do carrinho' }),
    );

    expect(await screen.findByText('Não foi possível remover a peça agora.')).toBeInTheDocument();
    expect(screen.getByText('Vestido floral')).toBeInTheDocument();
  });

  it('abrir a peça leva ao detalhe', async () => {
    const user = userEvent.setup();
    renderCart({ initial: { groups: [group(ANA, [item('1', 'Vestido floral', 100)])] } });

    await user.click(await screen.findByRole('button', { name: 'Vestido floral' }));

    expect(screen.getByRole('heading', { name: 'Detalhe da peça' })).toBeInTheDocument();
  });
});
