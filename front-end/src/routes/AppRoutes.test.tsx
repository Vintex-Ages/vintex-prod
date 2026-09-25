import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { getPreferences, getStyles, savePreferences } from '@/services/preferenceService';
import type { AuthUser } from '@/types/auth';
import AppRoutes from './AppRoutes';
import { paths, productDetail, sellerProductPath, storeProfile } from './paths';

afterEach(cleanup);

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
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
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

function makeAuthValue(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    token: null,
    isAuthenticated: false,
    loading: false,
    login: () => {},
    logout: () => {},
    ...overrides,
  };
}

/** Renderiza `AppRoutes` com uma sessão já dada, em vez do `AuthProvider` real. */
function renderAtWithAuth(path: string, authValue: AuthContextValue) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('<AppRoutes />', () => {
  it.each([
    [paths.home, 'Feed de achados'],
    [paths.catalog, 'Catálogo'],
    [productDetail('1'), 'Nike Camiseta Preto'],
    [paths.login, 'Entre na Vintex'],
    [paths.register, 'Crie sua conta'],
    [paths.onboarding, 'Qual é a sua estética?'],
    [paths.vintex, 'Conversa com a Vintex'],
  ])('renders the page mapped to %s', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  /**
   * O `Layout` (#105) existia testado e não era montado por ninguém: nenhuma
   * tela tinha marca, navegação, área de conta ou rodapé. Estes dois testes
   * travam onde ele entra — e, principalmente, onde ele NÃO entra.
   */
  it.each([paths.home, paths.catalog, productDetail('1'), paths.onboarding])(
    'veste %s com o esqueleto do app',
    async (path) => {
      renderAt(path);
      expect(await screen.findByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    },
  );

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
    [productDetail('1'), 'Nike Camiseta Preto'],
  ])('RN-26: %s continua acessível sem login', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  // --- #207: pontos de entrada da Vintex (FAB) ---

  it.each([paths.home, paths.catalog, productDetail('1')])(
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

  it('no detalhe do produto, o FAB sobe (raised) para não sobrepor a barra fixa', async () => {
    renderAt(productDetail('1'));

    const fab = await screen.findByRole('button', { name: 'Abrir assistente Vintex' });
    expect(fab.parentElement).toHaveClass('bottom-24');
    expect(fab.parentElement).toHaveClass('web:bottom-5');
  });

  it('na Home (sem barra fixa), o FAB fica na posição padrão, não raised', async () => {
    renderAt(paths.home);

    const fab = await screen.findByRole('button', { name: 'Abrir assistente Vintex' });
    expect(fab.parentElement).toHaveClass('bottom-5');
    expect(fab.parentElement).not.toHaveClass('bottom-24');
  });

  // --- FE-FND-4 (#205): rotas da Sprint 2 e guardas ---

  it.each([
    [paths.sell, 'Quero vender', SELLER],
    [paths.seller, 'Painel do vendedor', SELLER],
    [paths.sellerProductNew, 'Nova peça', SELLER],
    [sellerProductPath('1'), 'Editar peça', SELLER],
    [paths.cart, 'Carrinho', BUYER],
    [storeProfile('1'), 'Perfil da loja', null],
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

  it('/seller logado sem papel seller é redirecionado, não mostra o painel', async () => {
    renderAtWithAuth(paths.seller, makeAuthValue({ isAuthenticated: true, user: BUYER }));
    expect(await screen.findByRole('heading', { name: 'Feed de achados' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Painel do vendedor' })).not.toBeInTheDocument();
  });

  it('/store/:id abre sem login (leitura pública)', async () => {
    renderAtWithAuth(storeProfile('1'), makeAuthValue({ isAuthenticated: false, user: null }));
    expect(await screen.findByRole('heading', { name: 'Perfil da loja' })).toBeInTheDocument();
  });
});
