import { useCallback, useRef, useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/context/ToastContext';
import { CartContext, type CartContextValue } from '@/context/useCart';
import type { ApiError } from '@/types/auth';
import type { Cart as CartModel, CartGroup, CartItem, UnavailableReason } from '@/types/cart';
import type { Store } from '@/types/product';
import CartPage from './Cart';

const ANA = { id: 'loja-ana', name: 'Brechó da Ana' };
const BIA = { id: 'loja-bia', name: 'Brechó da Bia' };

function item(
  id: string,
  name: string,
  price: number,
  store = ANA,
  unavailable?: UnavailableReason,
): CartItem {
  return {
    product: { id, name, price, coverImageUrl: null, store },
    unavailable,
  };
}

/** Grupo como o service devolve: subtotal só das disponíveis, em centavos. */
function group(store: Store, items: CartItem[]): CartGroup {
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
                .map((entry) => ({
                  ...entry,
                  ...group(
                    entry.store,
                    entry.items.filter((cartItem) => cartItem.product.id !== productId),
                  ),
                }))
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
          group(ANA, [
            item('1', 'Vestido floral', 100),
            item('2', 'Saia midi', 50, ANA, 'vendido'),
          ]),
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

  // #297: pausa é temporária — a peça fica, marcada, sem aviso de venda.
  it('peça pausada fica no carrinho marcada como indisponível, sem aviso e fora do subtotal', async () => {
    const spies = renderCart({
      initial: {
        groups: [
          group(ANA, [
            item('1', 'Vestido floral', 100),
            item('2', 'Saia midi', 50, ANA, 'pausado'),
          ]),
        ],
      },
    });

    const ana = within(await screen.findByRole('region', { name: 'Brechó da Ana' }));
    expect(ana.getByText('Saia midi')).toBeInTheDocument();
    expect(ana.getByText('Indisponível')).toBeInTheDocument();
    expect(screen.getByTestId('subtotal-loja-ana')).toHaveTextContent('R$ 100,00');
    expect(screen.queryByText('Saia midi foi vendida e saiu do seu carrinho')).toBeNull();
    expect(spies.remove).not.toHaveBeenCalled();
  });

  it('avisa uma vez só, mesmo que o carrinho recarregue', async () => {
    renderCart({
      initial: { groups: [group(ANA, [item('2', 'Saia midi', 50, ANA, 'vendido')])] },
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
    // Isola o bloqueio do placeholder: esta loja tem Pix, mas o checkout ainda não existe.
    renderCart({
      initial: {
        groups: [{ ...group(ANA, [item('1', 'Vestido floral', 100)]), pixKey: 'ana@pix.test' }],
      },
    });

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

describe('#359 — dados Pix por loja no carrinho', () => {
  const NO_PIX = 'Este brechó ainda não cadastrou a chave Pix';
  const COMING_SOON = 'Em breve: pagamento por Pix direto ao brechó.';
  const aurora: Store = {
    id: '11',
    name: 'Brechó Aurora',
    verified: true,
    city: 'Porto Alegre',
    logoUrl: 'https://cdn.test/aurora.png',
  };
  const brisa: Store = {
    id: '22',
    name: 'Brechó Brisa',
    verified: false,
    city: 'Pelotas',
    logoUrl: 'https://cdn.test/brisa.png',
  };

  function pixGroup(
    store: Store = aurora,
    pixKey: string | undefined = 'aurora@pix.test',
  ): CartGroup {
    return {
      ...group(store, [item(`${store.id}-1`, 'Jaqueta jeans', 89.9, store)]),
      pixKey,
    };
  }

  async function region(name = aurora.name) {
    return within(await screen.findByRole('region', { name }));
  }

  it('preserva nome, peça e subtotal do grupo com Pix', async () => {
    renderCart({ initial: { groups: [pixGroup()] } });

    const store = await region();
    expect(store.getByRole('heading', { name: aurora.name })).toBeInTheDocument();
    expect(store.getByText('Jaqueta jeans')).toBeInTheDocument();
    expect(store.getByTestId('subtotal-11')).toHaveTextContent('R$ 89,90');
  });

  it('mostra a cidade da loja no próprio grupo', async () => {
    renderCart({ initial: { groups: [pixGroup()] } });

    expect((await region()).getByText('Porto Alegre')).toBeInTheDocument();
  });

  it('mostra a chave Pix integralmente', async () => {
    renderCart({ initial: { groups: [pixGroup()] } });

    expect((await region()).getByText('aurora@pix.test', { exact: true })).toBeInTheDocument();
  });

  it('mostra a logo identificada com o nome da loja', async () => {
    renderCart({ initial: { groups: [pixGroup()] } });

    expect((await region()).getByRole('img', { name: aurora.name })).toHaveAttribute(
      'src',
      aurora.logoUrl,
    );
  });

  it('sem logo apresenta fallback acessível, sem imagem com URL ausente', async () => {
    renderCart({ initial: { groups: [pixGroup({ ...aurora, logoUrl: undefined })] } });

    const fallback = (await region()).getByRole('img', { name: aurora.name });
    expect(fallback).toBeVisible();
    // Aceita iniciais, SVG ou imagem de fallback com URL válida, sem impor a estrutura.
    if (fallback.tagName === 'IMG') {
      expect(fallback.getAttribute('src')?.trim()).toBeTruthy();
    }
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['campo ausente', undefined],
    ['string vazia', ''],
    ['somente espaços', '   '],
  ] as const)('sem chave (%s) mostra o aviso exato e o motivo acessível', async (kind, pixKey) => {
    const source = pixGroup();
    // O service normaliza null para undefined. Também exercitamos null em runtime
    // para cobrir consumidores/fixtures legados sem ampliar o contrato de produção.
    const received = { ...source, pixKey } as CartGroup;
    if (kind === 'campo ausente') delete received.pixKey;
    renderCart({ initial: { groups: [received] } });

    const store = await region();
    expect(store.getByText(NO_PIX, { exact: true })).toBeVisible();
    expect(store.queryByText('aurora@pix.test')).not.toBeInTheDocument();
    const checkout = store.getByRole('button', { name: 'Finalizar compra' });
    expect(checkout).toBeDisabled();
    expect(checkout).toHaveAccessibleDescription(expect.stringContaining(NO_PIX));
    expect(store.getByText(COMING_SOON, { exact: true })).toBeVisible();
    expect(checkout).toHaveAccessibleDescription(expect.stringContaining(COMING_SOON));
  });

  it('mantém Pix, cidade, logo e aviso isolados entre duas lojas', async () => {
    const withoutPix = pixGroup(brisa);
    delete withoutPix.pixKey;
    renderCart({ initial: { groups: [pixGroup(), withoutPix] } });

    const first = await region();
    const second = await region(brisa.name);
    expect(first.getByText('aurora@pix.test')).toBeInTheDocument();
    expect(first.getByText('Porto Alegre')).toBeInTheDocument();
    expect(first.getByRole('img', { name: aurora.name })).toHaveAttribute('src', aurora.logoUrl);
    expect(first.queryByText(NO_PIX)).not.toBeInTheDocument();
    expect(second.queryByText('aurora@pix.test')).not.toBeInTheDocument();
    expect(second.getByText('Pelotas')).toBeInTheDocument();
    expect(second.getByRole('img', { name: brisa.name })).toHaveAttribute('src', brisa.logoUrl);
    expect(second.getByText(NO_PIX, { exact: true })).toBeInTheDocument();
    expect(first.getByRole('button', { name: 'Finalizar compra' })).toBeDisabled();
    expect(second.getByRole('button', { name: 'Finalizar compra' })).toBeDisabled();
    expect(first.getByRole('button', { name: 'Finalizar compra' })).not.toHaveAccessibleDescription(
      expect.stringContaining(NO_PIX),
    );
    expect(second.getByRole('button', { name: 'Finalizar compra' })).toHaveAccessibleDescription(
      expect.stringContaining(NO_PIX),
    );
  });

  it('com Pix mantém o checkout desabilitado e o aviso de em breve', async () => {
    renderCart({ initial: { groups: [pixGroup()] } });

    const store = await region();
    const checkout = store.getByRole('button', { name: 'Finalizar compra' });
    expect(checkout).toBeDisabled();
    expect(store.getByText(COMING_SOON, { exact: true })).toBeVisible();
    expect(checkout).toHaveAccessibleDescription(COMING_SOON);
    expect(store.queryByText(NO_PIX)).not.toBeInTheDocument();
  });

  it('preserva os metadados do grupo após remover uma peça', async () => {
    const user = userEvent.setup();
    const source = pixGroup();
    source.items.push(item('11-2', 'Saia midi', 30, aurora));
    source.subtotalCents = 11990;
    renderCart({ initial: { groups: [source] } });

    await user.click(await screen.findByRole('button', { name: 'Remover Saia midi do carrinho' }));

    const store = await region();
    expect(store.queryByText('Saia midi')).not.toBeInTheDocument();
    expect(store.getByText('aurora@pix.test')).toBeInTheDocument();
    expect(store.getByText('Porto Alegre')).toBeInTheDocument();
    expect(store.getByRole('img', { name: aurora.name })).toHaveAttribute('src', aurora.logoUrl);
    expect(store.getByTestId('subtotal-11')).toHaveTextContent('R$ 89,90');
  });

  it('preserva todo o conteúdo de uma chave longa, sem abreviar o texto', async () => {
    const longKey = `${'chave-pix-completa-'.repeat(12)}@brecho.test`;
    renderCart({ initial: { groups: [pixGroup(aurora, longKey)] } });

    expect((await region()).getByText(longKey, { exact: true }).textContent).toBe(longKey);
    // JSDOM não calcula layout: quebra visual e overflow serão verificados no navegador.
  });
});
