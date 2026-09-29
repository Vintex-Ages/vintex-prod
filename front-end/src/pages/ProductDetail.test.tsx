import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { ToastProvider } from '@/context/ToastContext';
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from '@/context/useAuth';
import { useAuth } from '@/context/useAuth';
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

import { addItem, getCart, removeItem } from '@/services/cartService';

const mockedGetCart = vi.mocked(getCart);
const mockedAddItem = vi.mocked(addItem);
const mockedRemoveItem = vi.mocked(removeItem);

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
            name: 'Nike Camiseta Preto',
            price: 79.9,
            coverImageUrl: 'https://picsum.photos/seed/vintex-1-0/600/800',
            store: { id: '1', name: 'Brechó Mercado Público', city: 'Porto Alegre' },
          },
          addedAt: '2026-09-26T12:00:00Z',
        },
      ],
      subtotalCents: 7990,
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

function renderAt(
  path: string,
  options?: { authenticated?: boolean; cartValue?: CartContextValue },
) {
  if (options?.authenticated) {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
  }

  const cartValue = options?.cartValue ?? createCartValue();

  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <CartContext.Provider value={cartValue}>
          <ToastProvider>
            <Routes>
              <Route path={paths.product} element={<ProductDetail />} />
              <Route path={paths.login} element={<LoginProbe />} />
              <Route path={paths.cart} element={<CartDestination />} />
            </Routes>
          </ToastProvider>
        </CartContext.Provider>
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
        <CartProvider>
          <ToastProvider>
            <Header />
            <Routes>
              <Route path={paths.product} element={<ProductDetail />} />
              <Route path={paths.cart} element={<CartDestination />} />
            </Routes>
          </ToastProvider>
        </CartProvider>
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
  // Objetivo declarado do ticket: mostra atributos, preço e card da loja.
  // NOTA: categoria e cor (também exigidos pelo ticket) ficaram de fora da
  // ficha visível por decisão explícita, pra bater com o layout do print de
  // referência (T-02) — ver JSDoc do componente.
  it('mostra marca, tamanho, conservação, material, medidas, cidade, preço e a história da peça', async () => {
    renderAt('/product/1');

    expect(await screen.findByRole('heading', { name: 'Nike Camiseta Preto' })).toBeTruthy();
    expect(screen.getByText('Nike')).toBeTruthy();
    expect(screen.getByText('M (Médio)')).toBeTruthy();
    expect(screen.getByText('Seminovo')).toBeTruthy();
    expect(screen.getByText('100% algodão')).toBeTruthy();
    expect(screen.getByText('Ombro a ombro 44cm • Comprimento 68cm')).toBeTruthy();
    expect(screen.getAllByText('Porto Alegre').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s?79,90/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Peça garimpada no Mercado Público de Porto Alegre/)).toBeTruthy();
  });

  it('mostra a trilha de navegação (início / cidade / loja / produto)', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    const trilha = screen.getByRole('navigation', { name: 'Trilha' });
    expect(within(trilha).getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/');
    expect(within(trilha).getByText('Porto Alegre')).toBeTruthy();
    expect(
      within(trilha).getAllByText('Brechó Mercado Público', { exact: false }).length,
    ).toBeGreaterThan(0);
    expect(within(trilha).getByText('Nike Camiseta Preto')).toHaveAttribute('aria-current', 'page');
  });

  it('mostra a galeria de fotos da peça, com miniaturas de navegação', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.getByRole('group', { name: /Galeria de fotos/ })).toBeTruthy();
    expect(screen.getByText('Foto 1 de 3')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Ver foto \d de 3/ })).toHaveLength(3);
  });

  it('mostra carregando antes do produto resolver', () => {
    renderAt('/product/1');

    expect(screen.getByText('Carregando produto...')).toBeTruthy();
  });

  it('mostra nome da loja e o selo de verificado quando a loja é verificada', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.getAllByText('Brechó Mercado Público').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'Confiável' })).toBeTruthy();
  });

  it('não mostra o selo de verificado quando a loja não é verificada', async () => {
    renderAt('/product/3');

    await screen.findByRole('heading', { name: 'Adidas Tênis Branco' });

    expect(screen.getAllByText('Roupa Rodada').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: 'Confiável' })).toBeNull();
  });

  // Objetivo declarado do ticket: card da loja linka o perfil do brechó.
  it('o card da loja é um link', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.getByRole('link', { name: /Ver loja/ })).toBeTruthy();
  });

  it('mostra "produto não encontrado" para um id inexistente', async () => {
    renderAt('/product/inexistente');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/não encontrada/i));
  });

  it('botão de ação final mostra "Comprar Agora" com o preço', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.getByRole('button', { name: /Comprar Agora.*R\$\s?79,90/ })).toBeTruthy();
  });

  it('peça vendida (status "vendido") mostra o selo "Já vendida"', async () => {
    renderAt('/product/4');

    await screen.findByRole('heading', { name: 'Zara Vestido Estampado' });

    expect(screen.getByText('Já vendida')).toBeInTheDocument();
  });

  it('peça vendida continua navegável — mostra o resto da ficha normalmente', async () => {
    renderAt('/product/4');

    await screen.findByRole('heading', { name: 'Zara Vestido Estampado' });

    expect(screen.getByText('Zara')).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s?149,90/).length).toBeGreaterThan(0);
  });

  it('peça ativa (status "ativo") NÃO mostra o selo e mantém "Comprar Agora" habilitado', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

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

    await screen.findByRole('heading', { name: 'Zara Vestido Estampado' });

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
      expect(await screen.findByRole('heading', { name: 'Nike Camiseta Preto' })).toBeTruthy();
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
    it('o link "Ver loja" aponta pra rota real do perfil da loja', async () => {
      renderAt('/product/1');

      await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

      const storeLink = screen.getByRole('link', { name: /Ver loja/ });
      expect(storeLink.getAttribute('href')).toMatch(/^\/store\//);
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

    const accountButton = await screen.findByRole('button', { name: SAMPLE_USER.name });
    expect(await screen.findByRole('button', { name: 'Carrinho, 0 itens' })).toBeInTheDocument();

    const addButton = await screen.findByRole('button', { name: 'Adicionar ao carrinho' });
    await waitFor(() => expect(addButton).toBeEnabled());
    await user.click(addButton);

    expect(await screen.findByRole('button', { name: 'No carrinho' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carrinho, 1 itens' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SAMPLE_USER.name })).toBe(accountButton);
    expect(mockedAddItem).toHaveBeenCalledWith(SAMPLE_USER.id, '1');
  });
});
