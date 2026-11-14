import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { ToastProvider } from '@/context/ToastContext';
import { getMyStore } from '@/services/storeService';
import type { AuthUser } from '@/types/auth';
import type { StoreProfile } from '@/types/store';
import { RequireAuth, RequireRole, RequireStore } from './guards';

vi.mock('@/services/storeService', () => ({ getMyStore: vi.fn() }));

const BUYER: AuthUser = {
  id: 'u_1',
  name: 'Ana Compradora',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

const SELLER: AuthUser = { ...BUYER, id: 'u_2', is_seller: true };
const ADMIN: AuthUser = { ...BUYER, id: 'u_3', is_admin: true };

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

function PathProbe() {
  const location = useLocation();
  return <span data-testid="path">{location.pathname}</span>;
}

/** Renderiza a rota protegida em /protegido, com /login e /home como alvos possíveis de redirect. */
function renderProtected(authValue: AuthContextValue, protectedElement: React.ReactNode) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={['/protegido']}>
        <Routes>
          <Route path="/protegido" element={protectedElement} />
          <Route path="/login" element={<p>Página de login</p>} />
          <Route path="/" element={<p>Home</p>} />
        </Routes>
        <PathProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('RequireAuth', () => {
  it('sem sessão: redireciona para /login e guarda a rota de origem', () => {
    renderProtected(
      makeAuthValue({ isAuthenticated: false, user: null }),
      <RequireAuth>
        <p>Conteúdo protegido</p>
      </RequireAuth>,
    );

    expect(screen.getByTestId('path')).toHaveTextContent('/login');
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });

  it('com sessão: renderiza o conteúdo protegido', () => {
    renderProtected(
      makeAuthValue({ isAuthenticated: true, user: BUYER }),
      <RequireAuth>
        <p>Conteúdo protegido</p>
      </RequireAuth>,
    );

    expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/protegido');
  });

  it('durante a restauração da sessão (loading): não redireciona nem mostra o conteúdo ainda', () => {
    renderProtected(
      makeAuthValue({ isAuthenticated: false, user: null, loading: true }),
      <RequireAuth>
        <p>Conteúdo protegido</p>
      </RequireAuth>,
    );

    expect(screen.getByTestId('path')).toHaveTextContent('/protegido');
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  it('sem sessão: redireciona para /login (mesma regra do RequireAuth)', () => {
    renderProtected(
      makeAuthValue({ isAuthenticated: false, user: null }),
      <RequireRole role="seller">
        <p>Painel do vendedor</p>
      </RequireRole>,
    );

    expect(screen.getByTestId('path')).toHaveTextContent('/login');
  });

  it('logado sem o papel exigido (seller): redireciona para home, não mostra o conteúdo', () => {
    renderProtected(
      makeAuthValue({ isAuthenticated: true, user: BUYER }),
      <RequireRole role="seller">
        <p>Painel do vendedor</p>
      </RequireRole>,
    );

    expect(screen.getByTestId('path')).toHaveTextContent('/');
    expect(screen.queryByText('Painel do vendedor')).not.toBeInTheDocument();
  });

  it('logado com o papel seller: renderiza o conteúdo', () => {
    renderProtected(
      makeAuthValue({ isAuthenticated: true, user: SELLER }),
      <RequireRole role="seller">
        <p>Painel do vendedor</p>
      </RequireRole>,
    );

    expect(screen.getByText('Painel do vendedor')).toBeInTheDocument();
  });

  it('logado sem o papel exigido (admin): redireciona para home', () => {
    renderProtected(
      makeAuthValue({ isAuthenticated: true, user: SELLER }),
      <RequireRole role="admin">
        <p>Painel admin</p>
      </RequireRole>,
    );

    expect(screen.getByTestId('path')).toHaveTextContent('/');
    expect(screen.queryByText('Painel admin')).not.toBeInTheDocument();
  });

  it('logado com o papel admin: renderiza o conteúdo', () => {
    renderProtected(
      makeAuthValue({ isAuthenticated: true, user: ADMIN }),
      <RequireRole role="admin">
        <p>Painel admin</p>
      </RequireRole>,
    );

    expect(screen.getByText('Painel admin')).toBeInTheDocument();
  });

  it('role="buyer": qualquer usuário autenticado (sem papéis extras) renderiza o conteúdo', () => {
    renderProtected(
      makeAuthValue({ isAuthenticated: true, user: BUYER }),
      <RequireRole role="buyer">
        <p>Área do comprador</p>
      </RequireRole>,
    );

    expect(screen.getByText('Área do comprador')).toBeInTheDocument();
  });
});

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

/** Como `renderProtected`, mas com `ToastProvider` e `/sell` como alvo do redirect de quem não tem loja. */
function renderStoreProtected(authValue: AuthContextValue) {
  return render(
    <AuthContext.Provider value={authValue}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/protegido']}>
          <Routes>
            <Route
              path="/protegido"
              element={
                <RequireStore>
                  <p>Painel do vendedor</p>
                </RequireStore>
              }
            />
            <Route path="/login" element={<p>Página de login</p>} />
            <Route path="/sell" element={<p>Quero vender</p>} />
          </Routes>
          <PathProbe />
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>,
  );
}

describe('RequireStore (RN-31, FE-US006-2 #213)', () => {
  beforeEach(() => {
    vi.mocked(getMyStore).mockReset();
  });

  it('critério 1: logado sem loja é levado a /sell com toast informativo', async () => {
    vi.mocked(getMyStore).mockResolvedValue(null);

    renderStoreProtected(makeAuthValue({ isAuthenticated: true, user: BUYER }));

    expect(await screen.findByText('Quero vender')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/sell');
    expect(screen.getByRole('status')).toHaveTextContent('Para anunciar, crie sua loja');
    expect(screen.queryByText('Painel do vendedor')).not.toBeInTheDocument();
  });

  it('critério 2: visitante anônimo cai em /login, sem consultar a loja', () => {
    renderStoreProtected(makeAuthValue({ isAuthenticated: false, user: null }));

    expect(screen.getByTestId('path')).toHaveTextContent('/login');
    expect(getMyStore).not.toHaveBeenCalled();
    expect(screen.queryByText('Para anunciar, crie sua loja')).not.toBeInTheDocument();
  });

  it('logado com loja: renderiza o conteúdo, sem toast', async () => {
    vi.mocked(getMyStore).mockResolvedValue(STORE);

    renderStoreProtected(makeAuthValue({ isAuthenticated: true, user: SELLER }));

    expect(await screen.findByText('Painel do vendedor')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/protegido');
    expect(screen.queryByText('Para anunciar, crie sua loja')).not.toBeInTheDocument();
  });

  it('enquanto verifica a loja: mostra carregando, sem redirecionar nem mostrar o conteúdo', () => {
    vi.mocked(getMyStore).mockReturnValue(new Promise(() => {}));

    renderStoreProtected(makeAuthValue({ isAuthenticated: true, user: SELLER }));

    expect(screen.getByRole('status')).toHaveTextContent('Verificando sua loja…');
    expect(screen.getByTestId('path')).toHaveTextContent('/protegido');
    expect(screen.queryByText('Painel do vendedor')).not.toBeInTheDocument();
  });

  it('falha ao verificar a loja: mostra erro com "Tentar de novo", sem redirecionar', async () => {
    vi.mocked(getMyStore).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(STORE);

    renderStoreProtected(makeAuthValue({ isAuthenticated: true, user: SELLER }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível verificar sua loja.',
    );
    expect(screen.getByTestId('path')).toHaveTextContent('/protegido');

    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Painel do vendedor')).toBeInTheDocument();
    expect(getMyStore).toHaveBeenCalledTimes(2);
  });
});
