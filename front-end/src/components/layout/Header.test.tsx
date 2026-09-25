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

  /**
   * O Header é montado pela rota-pai e não remonta quando a rota filha troca:
   * sem fechar na navegação, o menu viajava aberto para a página seguinte.
   */
  it('fecha o menu de conta ao navegar para outra rota', async () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Conta' }));
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Catálogo' }));

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/catalog'));
    expect(screen.queryByRole('button', { name: 'Criar conta' })).not.toBeInTheDocument();
  });

  it('fecha o menu de conta com Escape', () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Conta' }));
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('button', { name: 'Criar conta' })).not.toBeInTheDocument();
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

  it('mantém a navegação principal visível em todo tamanho de tela', () => {
    renderHeader();

    // Antes a navegacao era `hidden tablet:flex`: abaixo de 720px os dois links
    // sumiam e o catalogo so era alcancavel pelo rodape. Com a marca em `h3` em
    // vez de `h2`, os dois cabem — e dois links nao justificam um menu sanfonado.
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).not.toHaveClass('hidden');
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

  it('logado: mostra Meus Estilos & Preferências da IA no menu da conta', async () => {
    renderHeaderLoggedIn();

    fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));

    expect(
      screen.getByRole('button', { name: 'Meus Estilos & Preferências da IA' }),
    ).toBeInTheDocument();
  });

  it('logado: navega para /profile/preferences pelo menu da conta', async () => {
    renderHeaderLoggedIn();

    fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));
    fireEvent.click(screen.getByRole('button', { name: 'Meus Estilos & Preferências da IA' }));

    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent('/profile/preferences'),
    );
  });

  it('logado: fecha o menu depois de navegar para as preferências', async () => {
    renderHeaderLoggedIn();

    fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));
    fireEvent.click(screen.getByRole('button', { name: 'Meus Estilos & Preferências da IA' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Meus Estilos & Preferências da IA' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('anônimo: não mostra Meus Estilos & Preferências da IA no menu da conta', () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Conta' }));

    expect(
      screen.queryByRole('button', { name: 'Meus Estilos & Preferências da IA' }),
    ).not.toBeInTheDocument();
  });

  it('logado: ao abrir o menu e clicar em Sair, volta ao estado anônimo', async () => {
    renderHeaderLoggedIn();

    fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('button', { name: 'Conta' })).toBeInTheDocument();
  });
});
