import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { ProductGrid } from '@/components/product/ProductGrid';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { FavoritesProvider } from '@/context/FavoritesContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { ToastProvider } from '@/context/ToastContext';
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from '@/context/useAuth';
import { useAuth } from '@/context/useAuth';
import { useFavorites } from '@/context/useFavorites';
import { CartContext, type CartContextValue } from '@/context/useCart';
import { PENDING_ACTION_STORAGE_KEY } from '@/hooks/useProtectedAction';
import { paths } from '@/routes/paths';
import type { AuthUser } from '@/types/auth';
import type { Cart } from '@/types/cart';
import ProductDetail from './ProductDetail';

vi.mock('@/services/cartService', () => ({
  getCart: vi.fn(),
  addItem: vi.fn(),
  removeItem: vi.fn(),
}));

/**
 * Favoritos (#328): os wrappers continuam chamando o mock real do service
 * (`sessionStorage` por usuário); só assim cada teste pode forçar uma falha
 * pontual — o `404` de peça que deixou de existir — sem perder o resto.
 */
vi.mock('@/services/favoriteService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/favoriteService')>();
  return {
    ...actual,
    listFavoriteIds: vi.fn(actual.listFavoriteIds),
    addFavorite: vi.fn(actual.addFavorite),
    removeFavorite: vi.fn(actual.removeFavorite),
  };
});

import { addItem, getCart, removeItem } from '@/services/cartService';
import { addFavorite } from '@/services/favoriteService';

const mockedGetCart = vi.mocked(getCart);
const mockedAddItem = vi.mocked(addItem);
const mockedRemoveItem = vi.mocked(removeItem);
const mockedAddFavorite = vi.mocked(addFavorite);

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

const SAMPLE_USER: AuthUser = {
  id: 'u_1',
  name: 'Ana Brechó',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

const EMPTY_CART: Cart = { groups: [] };

const CART_WITH_PRODUCT: Cart = {
  groups: [
    {
      store: { id: '1', name: 'Brechó Mercado Público', city: 'Porto Alegre' },
      items: [
        {
          product: {
            id: '1',
            name: 'Jaqueta jeans vintage clara',
            price: 159.9,
            coverImageUrl: '/images/products/jaqueta-jeans-vintage.jpg',
            store: { id: '1', name: 'Brechó Mercado Público', city: 'Porto Alegre' },
          },
          addedAt: '2026-09-26T12:00:00Z',
        },
      ],
      subtotalCents: 15990,
    },
  ],
};

function createCartValue(overrides: Partial<CartContextValue> = {}): CartContextValue {
  return {
    cart: EMPTY_CART,
    count: 0,
    loading: false,
    error: null,
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function LoginProbe() {
  const { login } = useAuth();

  return <button onClick={() => login(SAMPLE_USER, 'tok-1')}>Concluir login</button>;
}

function CartDestination() {
  return <h1>Carrinho de compras</h1>;
}

/** No lugar do checkout: mostra as peças que chegaram pelo `state` da navegação (#319). */
function CheckoutDestination() {
  const state = useLocation().state as { products?: { id: string; name: string }[] } | null;
  return (
    <>
      <h1>Checkout</h1>
      <p data-testid="pecas-checkout">
        {state?.products?.map((product) => `${product.id}:${product.name}`).join(',')}
      </p>
    </>
  );
}

/** O mesmo produto da página, no formato do card do catálogo. */
const CARD_PRODUCT = {
  id: '1',
  name: 'Jaqueta jeans vintage clara',
  price: 159.9,
  coverImageUrl: null,
  store: { id: '1', name: 'Brechó Mercado Público' },
};

/**
 * Card de verdade ao lado do detalhe (#328): a grade é a mesma da Home, só
 * que aqui ela divide o `FavoritesProvider` com a página do produto. É o que
 * prova que favoritar num lado aparece no outro.
 */
function CardProbe() {
  const { ids, toggle } = useFavorites();

  return (
    <section aria-label="Grade de favoritos">
      <ProductGrid
        products={[CARD_PRODUCT]}
        onOpen={() => {}}
        isFavorite={(id) => ids.has(id)}
        onToggleFavorite={(id) => {
          void toggle(id).catch(() => undefined);
        }}
      />
    </section>
  );
}

function renderAt(
  path: string,
  options?: { authenticated?: boolean; cartValue?: CartContextValue; withCard?: boolean },
) {
  if (options?.authenticated) {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
  }

  const cartValue = options?.cartValue ?? createCartValue();

  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <FavoritesProvider>
          <CartContext.Provider value={cartValue}>
            <ToastProvider>
              <Routes>
                <Route
                  path={paths.product}
                  element={
                    options?.withCard ? (
                      <>
                        <ProductDetail />
                        <CardProbe />
                      </>
                    ) : (
                      <ProductDetail />
                    )
                  }
                />
                <Route path={paths.login} element={<LoginProbe />} />
                <Route path={paths.cart} element={<CartDestination />} />
                <Route path={paths.checkout} element={<CheckoutDestination />} />
              </Routes>
            </ToastProvider>
          </CartContext.Provider>
        </FavoritesProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function renderIntegratedAt(path: string) {
  window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');

  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <NotificationsProvider>
          <CartProvider>
            <FavoritesProvider>
              <ToastProvider>
                <Header />
                <Routes>
                  <Route path={paths.product} element={<ProductDetail />} />
                  <Route path={paths.cart} element={<CartDestination />} />
                </Routes>
              </ToastProvider>
            </FavoritesProvider>
          </CartProvider>
        </NotificationsProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetCart.mockResolvedValue(EMPTY_CART);
  mockedAddItem.mockResolvedValue(CART_WITH_PRODUCT);
  mockedRemoveItem.mockResolvedValue(EMPTY_CART);
});

describe('<ProductDetail />', () => {
  it('mostra os atributos do produto, preço, loja e história da peça', async () => {
    renderAt('/product/1');

    expect(
      await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' }),
    ).toBeTruthy();
    expect(screen.getByText('Roupas · Azul claro · Usado')).toBeInTheDocument();
    expect(screen.getByText('Vintage')).toBeTruthy();
    expect(screen.getByText('G (Grande)')).toBeTruthy();
    expect(screen.getByText('Usado')).toBeTruthy();
    expect(screen.getByText('Denim 100% algodão')).toBeTruthy();
    expect(screen.getByText('Ombro a ombro 50cm • Comprimento 62cm')).toBeTruthy();
    expect(screen.getAllByText('Porto Alegre').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s?159,90/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Jaqueta jeans garimpada em brechó/)).toBeTruthy();
  });

  it('mostra a curadoria do Figma e alterna o item localmente no look', async () => {
    const user = userEvent.setup();
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' });
    expect(screen.getByText('Curadoria da IA Vintex')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Bolsa Baú de Couro Caramelo' })).toBeInTheDocument();

    const addToLook = screen.getByRole('button', { name: '+ Adicionar' });
    await user.click(addToLook);

    expect(screen.getByRole('button', { name: '✓ Adicionada ao look' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('mostra a trilha de navegação (início / cidade / loja / produto)', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' });

    const trilha = screen.getByRole('navigation', { name: 'Trilha' });
    expect(within(trilha).getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/');
    expect(within(trilha).getByText('Porto Alegre')).toBeTruthy();
    expect(
      within(trilha).getAllByText('Brechó Mercado Público', { exact: false }).length,
    ).toBeGreaterThan(0);
    expect(within(trilha).getByText('Jaqueta jeans vintage clara')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('mostra a foto da peça sem controles de navegação para uma única imagem', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' });

    expect(screen.getByRole('group', { name: /Galeria de fotos/ })).toBeTruthy();
    expect(
      screen.getByRole('img', { name: /Jaqueta jeans vintage clara — foto 1 de 1/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Próxima foto' })).not.toBeInTheDocument();
  });

  it('mostra carregando antes do produto resolver', () => {
    renderAt('/product/1');

    expect(screen.getByText('Carregando produto...')).toBeTruthy();
  });

  it('mostra nome da loja e o selo de verificado quando a loja é verificada', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' });

    expect(screen.getAllByText('Brechó Mercado Público').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'Confiável' })).toBeTruthy();
  });

  // FE-US007-1: loja ainda não validada mostra o selo Pendente, não o Confiável.
  it('mostra o selo Pendente quando a loja não é verificada', async () => {
    renderAt('/product/3');

    await screen.findByRole('heading', { name: 'Jaqueta biker preta' });

    expect(screen.getAllByText('Roupa Rodada').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: 'Confiável' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Pendente' })).toBeTruthy();
  });

  // Objetivo declarado do ticket: card da loja linka o perfil do brechó.
  it('o card da loja é um link', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' });

    expect(screen.getByRole('link', { name: /Ver loja/ })).toBeTruthy();
  });

  it('mostra "produto não encontrado" para um id inexistente', async () => {
    renderAt('/product/inexistente');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/não encontrada/i));
  });

  it('botão de ação final mostra "Comprar Agora" com o preço', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' });

    expect(screen.getByRole('button', { name: /Comprar Agora.*R\$\s?159,90/ })).toBeTruthy();
  });

  it('peça vendida (status "vendido") mostra o selo "Já vendida"', async () => {
    renderAt('/product/4');

    await screen.findByRole('heading', { name: 'Vestido floral midi' });

    expect(screen.getByText('Já vendida')).toBeInTheDocument();
  });

  it('peça vendida continua navegável — mostra o resto da ficha normalmente', async () => {
    renderAt('/product/4');

    await screen.findByRole('heading', { name: 'Vestido floral midi' });

    expect(screen.getByText('Sem etiqueta')).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s?149,90/).length).toBeGreaterThan(0);
  });

  it('peça ativa (status "ativo") NÃO mostra o selo e mantém "Comprar Agora" habilitado', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' });

    expect(screen.queryByText('Já vendida')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Comprar Agora/ })).toBeEnabled();
  });

  /**
   * FE-US012-5 (#88): a partir desta task, os DOIS botões (favoritar e
   * comprar) ficam desabilitados quando a peça está vendida — revisão da
   * decisão da FE-US012-4 (#87), que tinha deixado só o favoritar ativo.
   * Critério explícito da #88, que cita a #87 como já cobrindo os dois.
   */
  it('peça vendida: favoritar e comprar ficam desabilitados, mesmo logado', async () => {
    renderAt('/product/4', { authenticated: true });

    await screen.findByRole('heading', { name: 'Vestido floral midi' });

    expect(screen.getByRole('button', { name: 'Adicionar aos favoritos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Comprar Agora/ })).toBeDisabled();
  });

  describe('barreira de login (FE-US012-5, #88)', () => {
    it('deslogado: favoritar abre a barreira de login', async () => {
      const user = userEvent.setup();
      renderAt('/product/1');

      await user.click(await screen.findByRole('button', { name: 'Adicionar aos favoritos' }));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('deslogado: comprar abre a barreira de login', async () => {
      const user = userEvent.setup();
      renderAt('/product/1');

      await user.click(await screen.findByRole('button', { name: /Comprar Agora/ }));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('na barreira, "Entrar" navega para /login guardando a origem', async () => {
      const user = userEvent.setup();
      renderAt('/product/1');

      await user.click(await screen.findByRole('button', { name: 'Adicionar aos favoritos' }));
      await screen.findByRole('dialog');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('na barreira, "Agora não" fecha sem navegar', async () => {
      const user = userEvent.setup();
      renderAt('/product/1');

      await user.click(await screen.findByRole('button', { name: 'Adicionar aos favoritos' }));
      await screen.findByRole('dialog');
      await user.click(screen.getByRole('button', { name: 'Agora não' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(
        await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' }),
      ).toBeTruthy();
    });

    it('logado: favoritar alterna o estado visual sem abrir a barreira', async () => {
      const user = userEvent.setup();
      renderAt('/product/1', { authenticated: true });

      const favoriteButton = await screen.findByRole('button', { name: 'Adicionar aos favoritos' });
      expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');

      await user.click(favoriteButton);

      expect(screen.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('logado: comprar não abre a barreira', async () => {
      const user = userEvent.setup();
      renderAt('/product/1', { authenticated: true });

      await user.click(await screen.findByRole('button', { name: /Comprar Agora/ }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // FE-US022-1 (#319): "Comprar Agora" abre o checkout com a peça, sem passar pelo carrinho.
    it('logado: Comprar Agora abre o checkout só com esta peça', async () => {
      const user = userEvent.setup();
      renderAt('/product/1', { authenticated: true });

      await user.click(await screen.findByRole('button', { name: /Comprar Agora/ }));

      expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
      expect(screen.getByTestId('pecas-checkout')).toHaveTextContent(
        '1:Jaqueta jeans vintage clara',
      );
    });

    it('deslogado: depois do login, volta ao checkout com a peça', async () => {
      const user = userEvent.setup();
      renderAt('/product/1');

      await user.click(await screen.findByRole('button', { name: /Comprar Agora/ }));
      await user.click(await screen.findByRole('button', { name: 'Entrar' }));
      await user.click(await screen.findByRole('button', { name: 'Concluir login' }));

      expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
      expect(screen.getByTestId('pecas-checkout')).toHaveTextContent(
        '1:Jaqueta jeans vintage clara',
      );
    });
    it('o link "Ver loja" aponta pra rota real do perfil da loja', async () => {
      renderAt('/product/1');

      await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' });

      const storeLink = screen.getByRole('link', { name: /Ver loja/ });
      expect(storeLink.getAttribute('href')).toMatch(/^\/store\//);
    });
  });

  describe('favoritar de verdade (FE-US013-1, #328)', () => {
    // Objetivo declarado do ticket: estado compartilhado entre detalhe e card.
    it('favoritar no detalhe reflete no card', async () => {
      const user = userEvent.setup();
      renderAt('/product/1', { authenticated: true, withCard: true });

      await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' });

      const card = screen.getByRole('region', { name: 'Grade de favoritos' });
      expect(within(card).getByRole('button', { name: 'Adicionar aos favoritos' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );

      const detailHeart = screen
        .getAllByRole('button', { name: 'Adicionar aos favoritos' })
        .find((button) => !card.contains(button));
      expect(detailHeart).toBeDefined();

      await user.click(detailHeart!);

      expect(within(card).getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('deslogado: depois do login, a peça fica favoritada', async () => {
      const user = userEvent.setup();
      renderAt('/product/1');

      await user.click(await screen.findByRole('button', { name: 'Adicionar aos favoritos' }));
      await screen.findByRole('dialog');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));
      await user.click(await screen.findByRole('button', { name: 'Concluir login' }));

      expect(await screen.findByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(mockedAddFavorite).toHaveBeenCalledWith('u_1', '1');
    });

    // Objetivo declarado do ticket: falha da API desfaz o coração, sem erro genérico.
    it('404 no PUT desfaz o coração sem erro genérico', async () => {
      const user = userEvent.setup();
      mockedAddFavorite.mockRejectedValueOnce({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Peça não encontrada.',
      });
      renderAt('/product/1', { authenticated: true });

      await user.click(await screen.findByRole('button', { name: 'Adicionar aos favoritos' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Adicionar aos favoritos' })).toHaveAttribute(
          'aria-pressed',
          'false',
        ),
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('adicionar ao carrinho (FE-US021-1, #225)', () => {
    it('logado: chama add exclusivamente com o id da peça', async () => {
      const user = userEvent.setup();
      const add = vi.fn().mockResolvedValue(undefined);
      renderAt('/product/1', {
        authenticated: true,
        cartValue: createCartValue({ add }),
      });

      await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));

      expect(add).toHaveBeenCalledOnce();
      expect(add).toHaveBeenCalledWith('1');
    });

    it('mostra o toast de sucesso somente depois que add resolve', async () => {
      const user = userEvent.setup();
      const add = vi.fn().mockResolvedValue(undefined);
      renderAt('/product/1', {
        authenticated: true,
        cartValue: createCartValue({ add }),
      });

      await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));

      expect(await screen.findByText('Adicionada ao carrinho')).toBeInTheDocument();
    });

    it('navega para paths.cart pela ação "Ver carrinho" do toast', async () => {
      const user = userEvent.setup();
      renderAt('/product/1', { authenticated: true });

      await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));
      await user.click(await screen.findByRole('button', { name: 'Ver carrinho' }));

      expect(
        await screen.findByRole('heading', { name: 'Carrinho de compras' }),
      ).toBeInTheDocument();
    });

    it('mostra "No carrinho" quando a peça já pertence a um dos grupos', async () => {
      renderAt('/product/1', {
        authenticated: true,
        cartValue: createCartValue({ cart: CART_WITH_PRODUCT, count: 1 }),
      });

      expect(await screen.findByRole('button', { name: 'No carrinho' })).toBeInTheDocument();
    });

    it('não chama add novamente quando a peça já está no carrinho', async () => {
      const user = userEvent.setup();
      const add = vi.fn().mockResolvedValue(undefined);
      renderAt('/product/1', {
        authenticated: true,
        cartValue: createCartValue({ cart: CART_WITH_PRODUCT, count: 1, add }),
      });

      const cartButton = await screen.findByRole('button', { name: 'No carrinho' });
      expect(cartButton).toBeDisabled();
      await user.click(cartButton);

      expect(add).not.toHaveBeenCalled();
    });

    it('desabilita a ação de carrinho para uma peça vendida', async () => {
      renderAt('/product/4', { authenticated: true });

      expect(await screen.findByRole('button', { name: 'Adicionar ao carrinho' })).toBeDisabled();
    });

    it('deslogado: abre o LoginInterceptor sem executar add', async () => {
      const user = userEvent.setup();
      const add = vi.fn().mockResolvedValue(undefined);
      renderAt('/product/1', { cartValue: createCartValue({ add }) });

      await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(add).not.toHaveBeenCalled();
    });

    it('preserva a origem e o id da peça na intenção do useProtectedAction', async () => {
      const user = userEvent.setup();
      renderAt('/product/1');

      await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));

      const rawPendingAction = window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY);
      expect(rawPendingAction).not.toBeNull();

      const pendingAction = JSON.parse(rawPendingAction ?? '{}') as {
        returnTo?: string;
        intent?: { type?: string; payload?: { productId?: string } };
      };
      expect(pendingAction.returnTo).toBe('/product/1');
      expect(pendingAction.intent?.type).toBeTruthy();
      expect(pendingAction.intent?.payload?.productId).toBe('1');
    });

    it('retoma a adição após autenticar e retornar à página de origem', async () => {
      const user = userEvent.setup();
      const add = vi.fn().mockResolvedValue(undefined);
      renderAt('/product/1', { cartValue: createCartValue({ add }) });

      await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));
      await user.click(await screen.findByRole('button', { name: 'Entrar' }));
      await user.click(await screen.findByRole('button', { name: 'Concluir login' }));

      await waitFor(() => expect(add).toHaveBeenCalledWith('1'));
      expect(await screen.findByText('Adicionada ao carrinho')).toBeInTheDocument();
    });

    it('mostra estado de carregamento e desabilita o botão enquanto add está pendente', async () => {
      const user = userEvent.setup();
      let resolveAdd: (() => void) | undefined;
      const add = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveAdd = resolve;
          }),
      );
      renderAt('/product/1', {
        authenticated: true,
        cartValue: createCartValue({ add }),
      });

      await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));

      expect(await screen.findByRole('button', { name: /Adicionando/i })).toBeDisabled();
      resolveAdd?.();
      expect(await screen.findByText('Adicionada ao carrinho')).toBeInTheDocument();
    });

    it('não inicia múltiplas adições durante uma operação pendente', async () => {
      const user = userEvent.setup();
      let resolveAdd: (() => void) | undefined;
      const add = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveAdd = resolve;
          }),
      );
      renderAt('/product/1', {
        authenticated: true,
        cartValue: createCartValue({ add }),
      });

      await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));
      const loadingButton = await screen.findByRole('button', { name: /Adicionando/i });
      await user.click(loadingButton);

      expect(add).toHaveBeenCalledOnce();
      resolveAdd?.();
      expect(await screen.findByText('Adicionada ao carrinho')).toBeInTheDocument();
    });

    it('não mostra toast de sucesso quando add rejeita', async () => {
      const user = userEvent.setup();
      const add = vi.fn().mockRejectedValue(new Error('Falha ao adicionar'));
      renderAt('/product/1', {
        authenticated: true,
        cartValue: createCartValue({ add }),
      });

      await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));
      await waitFor(() => expect(add).toHaveBeenCalledOnce());

      expect(screen.queryByText('Adicionada ao carrinho')).not.toBeInTheDocument();
    });

    it('permite tentar novamente depois que add rejeita', async () => {
      const user = userEvent.setup();
      const add = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('Falha ao adicionar'))
        .mockResolvedValueOnce(undefined);
      renderAt('/product/1', {
        authenticated: true,
        cartValue: createCartValue({ add }),
      });

      await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Adicionar ao carrinho' })).toBeEnabled(),
      );
      await user.click(screen.getByRole('button', { name: 'Adicionar ao carrinho' }));

      expect(add).toHaveBeenCalledTimes(2);
      expect(await screen.findByText('Adicionada ao carrinho')).toBeInTheDocument();
    });

    it('não permite iniciar a adição enquanto o carrinho está carregando', async () => {
      const user = userEvent.setup();
      const add = vi.fn().mockResolvedValue(undefined);
      renderAt('/product/1', {
        authenticated: true,
        cartValue: createCartValue({ loading: true, add }),
      });

      const cartButton = await screen.findByRole('button', { name: 'Adicionar ao carrinho' });
      expect(cartButton).toBeDisabled();
      await user.click(cartButton);

      expect(add).not.toHaveBeenCalled();
    });
  });

  it('atualiza botão e contador do Header pelo CartProvider compartilhado, sem remontar', async () => {
    const user = userEvent.setup();
    renderIntegratedAt('/product/1');

    await screen.findByRole('button', { name: 'Voltar' });
    expect(await screen.findByRole('link', { name: 'Sacola (0)' })).toBeInTheDocument();

    const addButton = await screen.findByRole('button', { name: 'Adicionar ao carrinho' });
    await waitFor(() => expect(addButton).toBeEnabled());
    await user.click(addButton);

    expect(await screen.findByRole('button', { name: 'No carrinho' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sacola (1)' })).toBeInTheDocument();
    expect(mockedAddItem).toHaveBeenCalledWith(SAMPLE_USER.id, '1');
  });
});
