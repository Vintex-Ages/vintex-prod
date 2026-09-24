import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY, useAuth } from '@/context/useAuth';
import { me } from '@/services/authService';
import type { AuthUser } from '@/types/auth';
import Header from './Header';

// Só `me` é substituído: é o que `refreshUser()` consulta. O resto do
// authService (logout etc.) segue o comportamento real do modo mock.
vi.mock('@/services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/authService')>();
  return { ...actual, me: vi.fn() };
});

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

/**
 * Expõe o `refreshUser` do contexto para o teste disparar a mesma atualização
 * que a tela de criar loja (#212) fará depois do `createStore`.
 */
let refreshUserFromTest: (() => Promise<void>) | undefined;
function RefreshProbe() {
  refreshUserFromTest = useAuth().refreshUser;
  return null;
}

function renderHeaderLoggedIn(user: AuthUser = SAMPLE_USER) {
  window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Header />
        <PathProbe />
        <RefreshProbe />
      </AuthProvider>
    </MemoryRouter>,
  );
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

  it('logado: ao abrir o menu e clicar em Sair, volta ao estado anônimo', async () => {
    renderHeaderLoggedIn();

    fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));

    expect(await screen.findByRole('button', { name: 'Conta' })).toBeInTheDocument();
  });

  describe('itens de vendedor no menu (FE-US006-2, #213)', () => {
    it('logado sem loja: mostra "Quero vender" e não os atalhos da loja', async () => {
      renderHeaderLoggedIn();

      fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));

      expect(screen.getByRole('button', { name: 'Quero vender' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Minha loja' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Anunciar peça' })).not.toBeInTheDocument();
    });

    it('logado sem loja: "Quero vender" leva a /sell e fecha o menu', async () => {
      renderHeaderLoggedIn();

      fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));
      fireEvent.click(screen.getByRole('button', { name: 'Quero vender' }));

      await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/sell'));
      expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
    });

    it('logado com loja: mostra "Minha loja" e "Anunciar peça", sem "Quero vender"', async () => {
      renderHeaderLoggedIn({ ...SAMPLE_USER, is_seller: true });

      fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));

      expect(screen.getByRole('button', { name: 'Minha loja' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Anunciar peça' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Quero vender' })).not.toBeInTheDocument();
    });

    it('logado com loja: "Minha loja" leva a /seller', async () => {
      renderHeaderLoggedIn({ ...SAMPLE_USER, is_seller: true });

      fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));
      fireEvent.click(screen.getByRole('button', { name: 'Minha loja' }));

      await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/seller$/));
    });

    it('logado com loja: "Anunciar peça" leva a /seller/products/new', async () => {
      renderHeaderLoggedIn({ ...SAMPLE_USER, is_seller: true });

      fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));
      fireEvent.click(screen.getByRole('button', { name: 'Anunciar peça' }));

      await waitFor(() =>
        expect(screen.getByTestId('path')).toHaveTextContent('/seller/products/new'),
      );
    });

    it('troca os itens com o menu aberto quando o contexto passa a is_seller: true', async () => {
      vi.mocked(me).mockResolvedValue({ ...SAMPLE_USER, is_seller: true });
      renderHeaderLoggedIn();

      fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));
      expect(screen.getByRole('button', { name: 'Quero vender' })).toBeInTheDocument();

      // O que a tela de criar loja fará depois do `createStore`: nenhum
      // reload, nenhuma remontagem do Header — só o contexto atualizado.
      await act(async () => {
        await refreshUserFromTest?.();
      });

      expect(screen.getByRole('button', { name: 'Minha loja' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Anunciar peça' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Quero vender' })).not.toBeInTheDocument();
    });
  });
});
