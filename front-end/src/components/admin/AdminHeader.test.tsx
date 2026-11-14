import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { paths } from '@/routes/paths';
import { AdminHeader } from './AdminHeader';

afterEach(cleanup);

const ADMIN_TABS = [
  { path: '/admin/receipts', label: 'Comprovantes' },
  { path: '/admin/dashboard', label: 'Painel geral' },
  { path: '/admin/moderation', label: 'Anúncios suspensos' },
  { path: '/admin/reports', label: 'Reclamações' },
] as const;

function NavigationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="admin-path">{location.pathname}</span>
      <button onClick={() => navigate(-1)}>Voltar</button>
      <button onClick={() => navigate(1)}>Avançar</button>
    </>
  );
}

function renderHeader(
  name: string | null,
  options: { initialEntries?: string[]; withNavigation?: boolean } = {},
) {
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
    <MemoryRouter initialEntries={options.initialEntries ?? [paths.adminReceipts]}>
      <AuthContext.Provider value={value}>
        <AdminHeader />
        {options.withNavigation && <NavigationProbe />}
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

  describe('#419 — RED: quatro abas e destaque derivado da URL', () => {
    function expectCurrentTab(path: string, label: string) {
      const nav = within(screen.getByRole('navigation', { name: 'Área administrativa' }));
      const current = nav.getAllByRole('link', { current: 'page' });
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveTextContent(label);
      expect(current[0]).toHaveAttribute('href', path);
      for (const link of nav.getAllByRole('link')) {
        if (link !== current[0]) expect(link).not.toHaveAttribute('aria-current');
      }
    }

    it('mostra exatamente os quatro destinos permitidos com links reais no nav nomeado', () => {
      renderHeader('Eva Vieira');

      const nav = within(screen.getByRole('navigation', { name: 'Área administrativa' }));
      expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(
        ADMIN_TABS.map(({ label }) => label),
      );
      for (const { label, path } of ADMIN_TABS) {
        expect(nav.getByRole('link', { name: label })).toHaveAttribute('href', path);
      }
    });

    it.each(ADMIN_TABS.slice(1))(
      'acesso direto a $path marca somente $label',
      ({ path, label }) => {
        renderHeader('Eva Vieira', { initialEntries: [path] });

        expectCurrentTab(path, label);
      },
    );

    it('clicar nas abas percorre as quatro URLs e atualiza o destaque', async () => {
      const user = userEvent.setup();
      renderHeader('Eva Vieira', { withNavigation: true });

      for (const { path, label } of [...ADMIN_TABS.slice(1), ADMIN_TABS[0]]) {
        const nav = within(screen.getByRole('navigation', { name: 'Área administrativa' }));
        await user.click(nav.getByRole('link', { name: label }));

        await waitFor(() => expect(screen.getByTestId('admin-path').textContent).toBe(path));
        expectCurrentTab(path, label);
      }
      expect(screen.getAllByRole('banner')).toHaveLength(1);
    });

    it('Voltar e Avançar acompanham o histórico real do roteador sem deixar a aba anterior ativa', async () => {
      const user = userEvent.setup();
      const history = [...ADMIN_TABS].reverse();
      renderHeader('Eva Vieira', {
        initialEntries: history.map(({ path }) => path),
        withNavigation: true,
      });

      expectCurrentTab(ADMIN_TABS[0].path, ADMIN_TABS[0].label);
      for (const { path, label } of ADMIN_TABS.slice(1)) {
        await user.click(screen.getByRole('button', { name: 'Voltar' }));
        await waitFor(() => expect(screen.getByTestId('admin-path').textContent).toBe(path));
        expectCurrentTab(path, label);
      }
      for (const { path, label } of [...ADMIN_TABS].reverse().slice(1)) {
        await user.click(screen.getByRole('button', { name: 'Avançar' }));
        await waitFor(() => expect(screen.getByTestId('admin-path').textContent).toBe(path));
        expectCurrentTab(path, label);
      }
    });

    it('permite alcançar cada link por Tab e navegar com Enter', async () => {
      const user = userEvent.setup();
      renderHeader('Eva Vieira', { withNavigation: true });

      await user.tab();
      expect(screen.getByRole('link', { name: /Vintex/ })).toHaveFocus();
      for (const { path, label } of ADMIN_TABS) {
        await user.tab();
        const nav = within(screen.getByRole('navigation', { name: 'Área administrativa' }));
        expect(nav.getByRole('link', { name: label })).toHaveFocus();
        await user.keyboard('{Enter}');

        await waitFor(() => expect(screen.getByTestId('admin-path').textContent).toBe(path));
        expectCurrentTab(path, label);
      }
    });
  });

  it('#419 — regressão: acesso direto a Comprovantes mantém somente essa aba como atual', () => {
    renderHeader('Eva Vieira', { initialEntries: [paths.adminReceipts] });

    const nav = within(screen.getByRole('navigation', { name: 'Área administrativa' }));
    const current = nav.getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('Comprovantes');
    expect(current[0]).toHaveAttribute('href', paths.adminReceipts);
  });
});
