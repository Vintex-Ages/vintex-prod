import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { CartContext, type CartContextValue } from '@/context/useCart';
import { getPreferences, getStyles, savePreferences } from '@/services/preferenceService';
import { getMyStore } from '@/services/storeService';
import type { AuthUser } from '@/types/auth';
import type { StoreProfile } from '@/types/store';
import AppRoutes from './AppRoutes';
import * as routePaths from './paths';
import {
  paths,
  productDetail,
  sellerProductPath,
  sellerProductReviewPath,
  storeProfile,
} from './paths';

vi.mock('@/services/storeService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storeService')>()),
  getMyStore: vi.fn(),
}));

const STORE: StoreProfile = {
  id: 'store-1',
  name: 'Brechó da Ana',
  description: 'Peças garimpadas.',
  logoUrl: null,
  city: 'Porto Alegre',
  state: 'RS',
  verification: 'pendente',
  createdAt: '2026-09-01T00:00:00.000Z',
};

beforeEach(() => {
  // Padrão: quem entra na área do vendedor tem loja (RequireStore, #213).
  vi.mocked(getMyStore).mockReset().mockResolvedValue(STORE);
});

afterEach(cleanup);

const CART_VALUE: CartContextValue = {
  cart: { groups: [] },
  count: 0,
  loading: false,
  error: null,
  add: async () => {},
  remove: async () => {},
  refresh: async () => {},
};

vi.mock('@/services/preferenceService', () => ({
  getStyles: vi.fn(),
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
}));

const MOCK_STYLES = [
  {
    type: 'estilo',
    value: 'streetwear',
    label: 'Streetwear Urbano',
    description: 'Oversized, moletons gráficos e sneakers raros',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStyles).mockResolvedValue(MOCK_STYLES);
  vi.mocked(getPreferences).mockResolvedValue([{ type: 'estilo', value: 'streetwear' }]);
  vi.mocked(savePreferences).mockResolvedValue(undefined);
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <CartContext.Provider value={CART_VALUE}>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </CartContext.Provider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const BUYER: AuthUser = {
  id: 'u_1',
  name: 'Ana Compradora',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

const SELLER: AuthUser = { ...BUYER, id: 'u_2', is_seller: true };
const ADMIN: AuthUser = { ...BUYER, id: 'u_3', is_admin: true };

function LocationProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  return (
    <>
      <span data-testid="route-path">{location.pathname}</span>
      <span data-testid="route-from">{from ?? ''}</span>
    </>
  );
}

function makeAuthValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    token: null,
    isAuthenticated: false,
    loading: false,
    login: () => {},
    logout: () => {},
    refreshUser: async () => {},
    ...overrides,
  };
}

/** Renderiza `AppRoutes` com uma sessão já dada, em vez do `AuthProvider` real. */
function renderAtWithAuth(path: string, authValue: AuthContextValue) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={authValue}>
        <CartContext.Provider value={CART_VALUE}>
          <ToastProvider>
            <AppRoutes />
            <LocationProbe />
          </ToastProvider>
        </CartContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('<AppRoutes />', () => {
  describe('FE-FND-6: rotas da Sprint 3', () => {
    it.each([
      ['/checkout', 'Checkout', BUYER],
      ['/profile/orders', 'Meus pedidos', BUYER],
      ['/profile/orders/123', 'Detalhe do pedido', BUYER],
      ['/profile/orders/123/payment', 'Pagamento do pedido', BUYER],
      ['/profile/favorites', 'Meus favoritos', BUYER],
      ['/admin/receipts', 'Painel admin', ADMIN],
      ['/stores', 'Brechós', null],
    ] as const)(
      'reconhece %s e renderiza seu placeholder no Layout',
      async (path, heading, user) => {
        renderAtWithAuth(path, makeAuthValue({ isAuthenticated: user !== null, user }));

        expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
        expect(screen.getByTestId('route-path').textContent).toBe(path);
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      },
    );

    it.each([
      ['/profile/orders', 'Meus pedidos'],
      ['/profile/orders?status=pending', 'Meus pedidos'],
      ['/checkout', 'Checkout'],
      ['/profile/orders/123', 'Detalhe do pedido'],
      ['/profile/orders/123/payment', 'Pagamento do pedido'],
      ['/profile/favorites', 'Meus favoritos'],
      ['/admin/receipts', 'Painel admin'],
    ])('anônimo em %s vai para login e preserva pathname + search', async (path, heading) => {
      renderAtWithAuth(path, makeAuthValue({}));

      await waitFor(() => expect(screen.getByTestId('route-path').textContent).toBe('/login'));
      expect(screen.getByTestId('route-from').textContent).toBe(path);
      expect(screen.getByRole('heading', { name: 'Entre na Vintex' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
    });

    it.each([
      ['comprador', BUYER],
      ['vendedor', SELLER],
    ] as const)('%s sem is_admin em /admin/receipts volta para home', async (_role, user) => {
      renderAtWithAuth('/admin/receipts', makeAuthValue({ isAuthenticated: true, user }));

      await waitFor(() => expect(screen.getByTestId('route-path').textContent).toBe('/'));
      expect(screen.queryByRole('heading', { name: 'Painel admin' })).not.toBeInTheDocument();
    });

    // Os helpers são chamados dentro dos testes: sua ausência na fase RED
    // não deve impedir a coleta e a execução dos testes das rotas existentes.
    it('orderDetailPath monta /profile/orders/123 e abre o detalhe do pedido', async () => {
      const path = routePaths.orderDetailPath('123');
      expect(path).toBe('/profile/orders/123');

      renderAtWithAuth(path, makeAuthValue({ isAuthenticated: true, user: BUYER }));

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Detalhe do pedido' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('route-path').textContent).toBe(path);
    });

    it('orderPaymentPath monta /profile/orders/123/payment e abre o pagamento', async () => {
      const path = routePaths.orderPaymentPath('123');
      expect(path).toBe('/profile/orders/123/payment');

      renderAtWithAuth(path, makeAuthValue({ isAuthenticated: true, user: BUYER }));

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Pagamento do pedido' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('route-path').textContent).toBe(path);
    });
  });

  it.each([
    [paths.home, 'Feed de achados'],
    [paths.catalog, 'Catálogo'],
    [productDetail('1'), 'Jaqueta jeans vintage clara'],
    [paths.login, 'Entre na Vintex'],
    [paths.register, 'Crie sua conta'],
    [paths.onboarding, 'Qual é a sua estética?'],
    [paths.vintex, 'Conversa com a Vintex'],
  ])('renders the page mapped to %s', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  /** O detalhe mantém a casca do app com uma barra própria e sem rodapé global. */
  it.each([paths.home, paths.catalog])('veste %s com o esqueleto do app', async (path) => {
    renderAt(path);
    expect(await screen.findByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
  });

  it('veste o detalhe com a barra do Figma e sem rodapé global', async () => {
    renderAt(productDetail('1'));

    expect(await screen.findByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compartilhar produto' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sacola (0)' })).toHaveAttribute('href', paths.cart);
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
  });

  it('renderiza onboarding com o cabeçalho próprio, sem o rodapé global', async () => {
    renderAt(paths.onboarding);
    expect(
      await screen.findByRole('heading', { name: 'Qual é a sua estética?' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it.each([paths.vintex, paths.login, paths.register])(
    'deixa %s fora do esqueleto, com o próprio cabeçalho',
    async (path) => {
      renderAt(path);
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
    },
  );

  it('falls back to the 404 page for an unknown route', () => {
    renderAt('/rota-que-nao-existe');
    expect(screen.getByRole('heading', { name: /não existe/i })).toBeInTheDocument();
  });

  it('veste o 404 com o esqueleto, para quem errou a URL ter volta', () => {
    renderAt('/rota-que-nao-existe');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    // Cabeçalho e rodapé: dois caminhos de volta onde antes não havia nenhum.
    expect(screen.getAllByRole('link', { name: 'Catálogo' })).toHaveLength(2);
  });

  /**
   * RN-26 (FE-US005-3, #75): visitante sem cadastro explora o app sem
   * precisar logar. As rotas de descoberta continuam navegáveis mesmo depois
   * dos guardas de rota entrarem no projeto — nenhuma delas deve ganhar
   * RequireAuth/RequireRole no futuro sem que este teste seja atualizado de
   * propósito.
   *
   * A 4ª rota citada no critério de aceite da issue ("perfil de loja") ainda
   * não existe no front-end (sem página, sem rota) — não há como testá-la
   * ainda. As 3 rotas de descoberta já implementadas estão cobertas abaixo.
   */
  it.each([
    [paths.home, 'Feed de achados'],
    [paths.catalog, 'Catálogo'],
    [productDetail('1'), 'Jaqueta jeans vintage clara'],
  ])('RN-26: %s continua acessível sem login', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  // --- #207: pontos de entrada da Vintex (FAB) ---

  it.each([paths.home, paths.catalog])(
    'mostra o FAB da Vintex em %s (dentro do Layout)',
    async (path) => {
      renderAt(path);
      expect(
        await screen.findByRole('button', { name: 'Abrir assistente Vintex' }),
      ).toBeInTheDocument();
    },
  );

  it.each([paths.vintex, paths.login, paths.register])(
    'não mostra o FAB da Vintex em %s (fora do Layout, de propósito)',
    async (path) => {
      renderAt(path);
      await screen.findByRole('heading', { level: 1 });
      expect(
        screen.queryByRole('button', { name: 'Abrir assistente Vintex' }),
      ).not.toBeInTheDocument();
    },
  );

  it('não mostra o FAB global no detalhe, que já tem curadoria inline', async () => {
    renderAt(productDetail('1'));

    await screen.findByRole('heading', { name: 'Jaqueta jeans vintage clara' });
    expect(
      screen.queryByRole('button', { name: 'Abrir assistente Vintex' }),
    ).not.toBeInTheDocument();
  });

  it('na Home (sem barra fixa), o FAB fica na posição padrão, não raised', async () => {
    renderAt(paths.home);

    const fab = await screen.findByRole('button', { name: 'Abrir assistente Vintex' });
    expect(fab.parentElement).toHaveClass('bottom-5');
    expect(fab.parentElement).not.toHaveClass('bottom-24');
  });

  // --- FE-FND-4 (#205): rotas da Sprint 2 e guardas ---

  it.each([
    [paths.seller, 'Painel do vendedor', SELLER],
    [paths.sellerProductNew, 'Nova peça', SELLER],
    [sellerProductPath('1'), 'Editar peça', SELLER],
    [sellerProductReviewPath('1'), 'Revisar anúncio', SELLER],
    [paths.cart, 'Seu carrinho', BUYER],
    [storeProfile('1'), 'Brechó Mercado Público', null],
  ])('renderiza o placeholder de %s dentro do Layout', async (path, heading, user) => {
    renderAtWithAuth(
      path,
      makeAuthValue(
        user ? { isAuthenticated: true, user } : { isAuthenticated: false, user: null },
      ),
    );

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('/profile/preferences autenticado renderiza a página real dentro do Layout', async () => {
    renderAtWithAuth(
      paths.profilePreferences,
      makeAuthValue({ isAuthenticated: true, user: BUYER }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Meus Estilos & Preferências da IA' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /streetwear/i })).toBeChecked();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('/profile/preferences sem sessão redireciona para /login', async () => {
    renderAtWithAuth(
      paths.profilePreferences,
      makeAuthValue({ isAuthenticated: false, user: null }),
    );

    expect(await screen.findByRole('heading', { name: 'Entre na Vintex' })).toBeInTheDocument();
    expect(getStyles).not.toHaveBeenCalled();
    expect(getPreferences).not.toHaveBeenCalled();
  });

  it('/seller sem sessão redireciona a /login', async () => {
    renderAtWithAuth(paths.seller, makeAuthValue({ isAuthenticated: false, user: null }));
    await screen.findByText('Entre na Vintex');
  });

  it.each([
    paths.seller,
    paths.sellerProductNew,
    sellerProductPath('1'),
    sellerProductReviewPath('1'),
  ])(
    'RN-31 (#213): %s logado sem loja vai a /sell com o aviso, não mostra a área do vendedor',
    async (path) => {
      vi.mocked(getMyStore).mockResolvedValue(null);

      renderAtWithAuth(path, makeAuthValue({ isAuthenticated: true, user: BUYER }));

      expect(await screen.findByRole('heading', { name: 'Quero vender' })).toBeInTheDocument();
      expect(screen.getByText('Para anunciar, crie sua loja')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Painel do vendedor' })).not.toBeInTheDocument();
    },
  );

  // --- FE-US006-1 (#212): /sell é a tela real ---

  // FE-US003b-1 (#215): o contrato de venda vem antes do formulário.
  it('/sell logado sem loja mostra o contrato de venda dentro do Layout', async () => {
    vi.mocked(getMyStore).mockResolvedValue(null);

    renderAtWithAuth(paths.sell, makeAuthValue({ isAuthenticated: true, user: BUYER }));

    expect(await screen.findByRole('heading', { name: 'Quero vender' })).toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: 'Contrato de venda' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('P-06: /sell com loja vai ao painel do vendedor', async () => {
    renderAtWithAuth(paths.sell, makeAuthValue({ isAuthenticated: true, user: SELLER }));

    expect(await screen.findByRole('heading', { name: 'Painel do vendedor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir minha loja' })).not.toBeInTheDocument();
  });

  it('/sell sem sessão redireciona a /login', async () => {
    renderAtWithAuth(paths.sell, makeAuthValue({ isAuthenticated: false, user: null }));

    expect(await screen.findByRole('heading', { name: 'Entre na Vintex' })).toBeInTheDocument();
  });

  it('/store/:id abre sem login (leitura pública)', async () => {
    renderAtWithAuth(storeProfile('1'), makeAuthValue({ isAuthenticated: false, user: null }));
    expect(
      await screen.findByRole('heading', { name: 'Brechó Mercado Público' }),
    ).toBeInTheDocument();
  });
});
