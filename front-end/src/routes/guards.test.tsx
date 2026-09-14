import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import type { AuthUser } from '@/types/auth';
import { RequireAuth, RequireRole } from './guards';

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
