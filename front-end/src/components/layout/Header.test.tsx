import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from '@/context/useAuth';
import type { AuthUser } from '@/types/auth';
import Header from './Header';

afterEach(cleanup);

const SAMPLE_USER: AuthUser = {
  id: 'u_1',
  name: 'Ana Brechó',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

function PathProbe() {
  const location = useLocation();
  return <span data-testid="path">{location.pathname}</span>;
}

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Header />
        <PathProbe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function renderHeaderLoggedIn() {
  window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
  return renderHeader();
}

describe('<Header />', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('renders the brand link to home', () => {
    renderHeader();

    expect(screen.getByRole('link', { name: /vintex/i })).toHaveAttribute('href', '/');
  });

  it('renders the primary navigation links', () => {
    renderHeader();

    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '/catalog');
  });

  it('hides the primary navigation on mobile and shows it from tablet up', () => {
    renderHeader();

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveClass('hidden');
    expect(nav).toHaveClass('tablet:flex');
  });

  it('anônimo: mostra o botão "Conta" fechado, sem o menu visível', () => {
    renderHeader();

    expect(screen.getByRole('button', { name: 'Conta' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('anônimo: ao abrir o menu, navega para /login ao clicar em Entrar', async () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Conta' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/login'));
  });

  it('anônimo: ao abrir o menu, navega para /register ao clicar em Criar conta', async () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Conta' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Criar conta' }));

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/register'));
  });

  it('logado: o botão da conta mostra o nome do usuário', async () => {
    renderHeaderLoggedIn();

    expect(await screen.findByRole('button', { name: 'Ana Brechó' })).toBeInTheDocument();
  });

  it('logado: ao abrir o menu e clicar em Sair, volta ao estado anônimo', async () => {
    renderHeaderLoggedIn();

    fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('button', { name: 'Conta' })).toBeInTheDocument();
  });
});
