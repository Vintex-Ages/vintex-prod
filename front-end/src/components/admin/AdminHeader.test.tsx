import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { AdminHeader } from './AdminHeader';

afterEach(cleanup);

function renderHeader(name: string | null) {
  const value: AuthContextValue = {
    user: name
      ? { id: 'u_3', name, email: 'eva@exemplo.com', is_seller: false, is_admin: true }
      : null,
    token: null,
    isAuthenticated: name !== null,
    loading: false,
    login: () => {},
    logout: () => {},
    refreshUser: async () => {},
  };
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={value}>
        <AdminHeader />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('<AdminHeader />', () => {
  it('tem a marca com link para a home e a aba "Comprovantes" ativa', () => {
    renderHeader('Eva Vieira');

    expect(screen.getByRole('link', { name: /Vintex/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Comprovantes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('mostra as iniciais de quem está logado', () => {
    renderHeader('Eva Vieira');

    expect(screen.getByText('EV')).toBeInTheDocument();
  });

  it('com nome de uma palavra, usa só a inicial', () => {
    renderHeader('Cris');

    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('com nome em branco, mostra o avatar sem iniciais', () => {
    renderHeader('   ');

    expect(screen.getByTestId('admin-avatar')).toHaveTextContent('');
  });

  it('mostra o rótulo do painel e o nome de quem está logado (web)', () => {
    renderHeader('Eva Vieira');

    expect(screen.getByText('Painel administrativo')).toBeInTheDocument();
    expect(screen.getByTestId('admin-account')).toHaveTextContent('Eva Vieira');
  });

  it('sem usuário, não mostra avatar', () => {
    renderHeader(null);

    expect(screen.queryByTestId('admin-avatar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-account')).not.toBeInTheDocument();
  });
});
