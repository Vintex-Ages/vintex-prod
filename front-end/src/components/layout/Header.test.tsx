import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY, useAuth } from '@/context/useAuth';
import { CartContext, type CartContextValue } from '@/context/useCart';
import { paths } from '@/routes/paths';
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
  return (
    <span data-testid="path">
      {location.pathname}
      {location.search}
    </span>
  );
}

function createCartValue(count = 0): CartContextValue {
  return {
    cart: { groups: [] },
    count,
    loading: false,
    error: null,
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

function renderHeader(options?: { count?: number; initialEntry?: string }) {
  return render(
    <MemoryRouter initialEntries={[options?.initialEntry ?? '/']}>
      <AuthProvider>
        <CartContext.Provider value={createCartValue(options?.count)}>
          <Header />
          <PathProbe />
        </CartContext.Provider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function getMobileSearchToggle(): HTMLButtonElement {
  const toggle = screen
    .queryAllByRole('button', { name: 'Buscar' })
    .find((button) => button.hasAttribute('aria-expanded') && button.hasAttribute('aria-controls'));

  if (!(toggle instanceof HTMLButtonElement)) {
    throw new Error('Lupa mobile acessível com aria-expanded e aria-controls não encontrada.');
  }

  return toggle;
}

function getControlledMobileSearch(toggle: HTMLButtonElement): HTMLElement | null {
  const controlledId = toggle.getAttribute('aria-controls');
  return controlledId ? document.getElementById(controlledId) : null;
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

function renderHeaderLoggedIn(user: AuthUser = SAMPLE_USER, options?: { count?: number }) {
  window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <CartContext.Provider value={createCartValue(options?.count)}>
          <Header />
          <PathProbe />
          <RefreshProbe />
        </CartContext.Provider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function ReactiveCartHeader() {
  const [count, setCount] = useState(0);

  return (
    <CartContext.Provider value={createCartValue(count)}>
      <Header />
      <PathProbe />
      <button onClick={() => setCount(3)}>Atualizar contagem</button>
    </CartContext.Provider>
  );
}

function renderReactiveHeaderLoggedIn() {
  window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');

  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <ReactiveCartHeader />
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

  it('mantém os links no desktop e oferece um acionador de navegação no mobile', () => {
    renderHeader();

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveClass('hidden', 'tablet:flex');
    expect(screen.getByRole('button', { name: 'Abrir menu principal' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('abre o menu mobile com Home e Catálogo e fecha ao selecionar uma opção', async () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu principal' }));

    const mobileNav = screen.getByRole('navigation', { name: 'Principal mobile' });
    expect(screen.getByRole('button', { name: 'Fechar menu principal' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(mobileNav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    fireEvent.click(within(mobileNav).getByRole('link', { name: 'Catálogo' }));

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/catalog'));
    expect(screen.queryByRole('navigation', { name: 'Principal mobile' })).not.toBeInTheDocument();
  });

  it('fecha o menu mobile com Escape', () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu principal' }));
    expect(screen.getByRole('navigation', { name: 'Principal mobile' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('navigation', { name: 'Principal mobile' })).not.toBeInTheDocument();
  });

  it('permite abrir e percorrer a navegação mobile pelo teclado', async () => {
    const user = userEvent.setup();
    renderHeader();

    const toggle = screen.getByRole('button', { name: 'Abrir menu principal' });
    toggle.focus();
    await user.keyboard('{Enter}');

    const mobileNav = screen.getByRole('navigation', { name: 'Principal mobile' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.tab();
    expect(within(mobileNav).getByRole('link', { name: 'Home' })).toHaveFocus();
  });

  describe('busca mobile expansível', () => {
    it('inicia recolhida e associa a lupa à região controlada', () => {
      renderHeader({ initialEntry: '/product/1' });

      const toggle = getMobileSearchToggle();

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveAttribute('aria-controls');
      expect(getControlledMobileSearch(toggle)).not.toBeInTheDocument();
    });

    it('abre o SearchBar existente ao clicar na lupa e fecha ao clicar novamente', async () => {
      const user = userEvent.setup();
      renderHeader({ initialEntry: '/product/1' });

      const toggle = getMobileSearchToggle();
      await user.click(toggle);

      const mobileSearch = getControlledMobileSearch(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(mobileSearch).toBeInTheDocument();
      expect(within(mobileSearch!).getByRole('searchbox', { name: 'Buscar' })).toBeInTheDocument();

      await user.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(getControlledMobileSearch(toggle)).not.toBeInTheDocument();
    });

    it('move o foco para o campo de pesquisa ao expandir', async () => {
      const user = userEvent.setup();
      renderHeader({ initialEntry: '/product/1' });

      const toggle = getMobileSearchToggle();
      await user.click(toggle);

      const mobileSearch = getControlledMobileSearch(toggle);
      expect(within(mobileSearch!).getByRole('searchbox', { name: 'Buscar' })).toHaveFocus();
    });

    it('digita e envia pelo Enter, navegando para o catálogo com o termo', async () => {
      const user = userEvent.setup();
      renderHeader({ initialEntry: '/product/1' });

      const toggle = getMobileSearchToggle();
      await user.click(toggle);
      const mobileSearch = getControlledMobileSearch(toggle);
      await user.type(
        within(mobileSearch!).getByRole('searchbox', { name: 'Buscar' }),
        'camiseta{Enter}',
      );

      await waitFor(() =>
        expect(screen.getByTestId('path')).toHaveTextContent('/catalog?q=camiseta'),
      );
    });

    it('remove espaços externos e codifica caracteres especiais', async () => {
      const user = userEvent.setup();
      renderHeader({ initialEntry: '/product/1' });

      const toggle = getMobileSearchToggle();
      await user.click(toggle);
      const mobileSearch = getControlledMobileSearch(toggle);
      await user.type(
        within(mobileSearch!).getByRole('searchbox', { name: 'Buscar' }),
        '  vestido & verão  {Enter}',
      );

      await waitFor(() =>
        expect(screen.getByTestId('path')).toHaveTextContent(
          '/catalog?q=vestido%20%26%20ver%C3%A3o',
        ),
      );
    });

    it('pesquisa vazia navega para o catálogo sem o parâmetro q', async () => {
      const user = userEvent.setup();
      renderHeader({ initialEntry: '/product/1' });

      const toggle = getMobileSearchToggle();
      await user.click(toggle);
      const mobileSearch = getControlledMobileSearch(toggle);
      await user.type(
        within(mobileSearch!).getByRole('searchbox', { name: 'Buscar' }),
        '   {Enter}',
      );

      await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/catalog$/));
    });

    it('fecha a região após enviar mesmo quando o pathname já é o catálogo', async () => {
      const user = userEvent.setup();
      renderHeader({ initialEntry: paths.catalog });

      const toggle = getMobileSearchToggle();
      await user.click(toggle);
      const mobileSearch = getControlledMobileSearch(toggle);
      await user.type(
        within(mobileSearch!).getByRole('searchbox', { name: 'Buscar' }),
        'jaqueta{Enter}',
      );

      await waitFor(() =>
        expect(screen.getByTestId('path')).toHaveTextContent('/catalog?q=jaqueta'),
      );
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(getControlledMobileSearch(toggle)).not.toBeInTheDocument();
    });

    it('Escape fecha a busca e devolve o foco à lupa', async () => {
      const user = userEvent.setup();
      renderHeader({ initialEntry: '/product/1' });

      const toggle = getMobileSearchToggle();
      await user.click(toggle);
      expect(getControlledMobileSearch(toggle)).toBeInTheDocument();

      await user.keyboard('{Escape}');

      expect(getControlledMobileSearch(toggle)).not.toBeInTheDocument();
      expect(toggle).toHaveFocus();
    });

    it.each([
      ['Enter', '{Enter}'],
      ['Space', ' '],
    ])('permite abrir a busca com %s', async (_keyName, key) => {
      const user = userEvent.setup();
      renderHeader({ initialEntry: '/product/1' });

      const toggle = getMobileSearchToggle();
      toggle.focus();
      await user.keyboard(key);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(getControlledMobileSearch(toggle)).toBeInTheDocument();
    });

    it('abrir a busca fecha a navegação mobile e o AccountMenu', async () => {
      const user = userEvent.setup();
      renderHeader({ initialEntry: '/product/1' });

      await user.click(screen.getByRole('button', { name: 'Abrir menu principal' }));
      expect(screen.getByRole('navigation', { name: 'Principal mobile' })).toBeInTheDocument();

      const toggle = getMobileSearchToggle();
      await user.click(toggle);
      expect(
        screen.queryByRole('navigation', { name: 'Principal mobile' }),
      ).not.toBeInTheDocument();

      await user.click(toggle);
      await user.click(screen.getByRole('button', { name: 'Conta' }));
      expect(screen.getByRole('button', { name: 'Criar conta' })).toBeInTheDocument();

      await user.click(toggle);
      expect(screen.queryByRole('button', { name: 'Criar conta' })).not.toBeInTheDocument();
      expect(getControlledMobileSearch(toggle)).toBeInTheDocument();
    });

    it('abrir a navegação mobile ou o AccountMenu fecha a busca', async () => {
      const user = userEvent.setup();
      renderHeader({ initialEntry: '/product/1' });

      const toggle = getMobileSearchToggle();
      await user.click(toggle);
      await user.click(screen.getByRole('button', { name: 'Abrir menu principal' }));
      expect(getControlledMobileSearch(toggle)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Fechar menu principal' }));
      await user.click(toggle);
      await user.click(screen.getByRole('button', { name: 'Conta' }));
      expect(getControlledMobileSearch(toggle)).not.toBeInTheDocument();
    });

    it('preserva a busca desktop existente nas rotas sem busca própria', () => {
      renderHeader({ initialEntry: '/product/1' });

      const desktopSearch = screen.getByPlaceholderText('Busque por peça, marca ou brechó…');
      const responsiveWrapper = desktopSearch.closest('form')?.parentElement?.parentElement;

      expect(desktopSearch).toBeInTheDocument();
      expect(responsiveWrapper).toHaveClass('hidden', 'tablet:flex');
    });

    it.each([paths.home, paths.catalog])(
      'mantém a busca desktop recolhida em %s e oferece a lupa mobile',
      (initialEntry) => {
        renderHeader({ initialEntry });

        expect(screen.queryByRole('searchbox', { name: 'Buscar' })).not.toBeInTheDocument();
        expect(getMobileSearchToggle()).toHaveAttribute('aria-expanded', 'false');
      },
    );
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

  describe('contador do carrinho (FE-US021-1, #225)', () => {
    it('anônimo: não mostra o CartBadge', () => {
      renderHeader({ count: 3 });

      expect(screen.queryByRole('button', { name: /Carrinho/ })).not.toBeInTheDocument();
    });

    it('logado: mostra o CartBadge mesmo quando count é zero', async () => {
      renderHeaderLoggedIn(SAMPLE_USER, { count: 0 });

      expect(await screen.findByRole('button', { name: 'Carrinho, 0 itens' })).toBeInTheDocument();
    });

    it('apresenta no CartBadge a contagem fornecida por useCart', async () => {
      renderHeaderLoggedIn(SAMPLE_USER, { count: 3 });

      expect(await screen.findByRole('button', { name: 'Carrinho, 3 itens' })).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('navega para paths.cart ao clicar no CartBadge', async () => {
      renderHeaderLoggedIn(SAMPLE_USER, { count: 1 });

      fireEvent.click(await screen.findByRole('button', { name: 'Carrinho, 1 itens' }));

      await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(paths.cart));
    });

    it('atualiza a contagem sem recarregar ou remontar o Header', async () => {
      renderReactiveHeaderLoggedIn();

      const accountButton = await screen.findByRole('button', { name: SAMPLE_USER.name });
      expect(screen.getByRole('button', { name: 'Carrinho, 0 itens' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Atualizar contagem' }));

      expect(await screen.findByRole('button', { name: 'Carrinho, 3 itens' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: SAMPLE_USER.name })).toBe(accountButton);
    });
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
      renderHeaderLoggedIn();

      fireEvent.click(await screen.findByRole('button', { name: 'Ana Brechó' }));
      expect(screen.getByRole('button', { name: 'Quero vender' })).toBeInTheDocument();

      // O que a tela de criar loja fará depois do `createStore`: nenhum
      // reload, nenhuma remontagem do Header — só o contexto atualizado.
      // O `me()` só passa a responder vendedor aqui: o `AuthProvider` já
      // chama `me()` na montagem para confirmar o papel (#267), e com o mock
      // configurado antes do render o menu abriria como vendedor.
      vi.mocked(me).mockResolvedValue({ ...SAMPLE_USER, is_seller: true });
      await act(async () => {
        await refreshUserFromTest?.();
      });

      expect(screen.getByRole('button', { name: 'Minha loja' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Anunciar peça' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Quero vender' })).not.toBeInTheDocument();
    });
  });
});
