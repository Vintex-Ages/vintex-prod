import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { paths } from '@/routes/paths';
import { getDashboard } from '@/services/dashboardService';
import type { AdminDashboard as AdminDashboardData } from '@/types/dashboard';
import AdminDashboard from './AdminDashboard';

vi.mock('@/services/dashboardService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/dashboardService')>()),
  getDashboard: vi.fn(),
}));

/** Painel geral da administradora (FE-US033-1, #413). */

const ADMIN: AuthContextValue = {
  user: {
    id: 'u_3',
    name: 'Eva Vieira',
    email: 'eva@exemplo.com',
    is_seller: false,
    is_admin: true,
  },
  token: 't',
  isAuthenticated: true,
  loading: false,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
};

const COM_VENDAS: AdminDashboardData = {
  storesCount: 7,
  usersCount: 1520,
  activeProductsCount: 1284,
  salesVolume: 128450,
  // De propósito, não é 9% do volume: a tela mostra o que o back manda.
  commissionTotal: 11560.5,
  salesByStore: [
    { storeId: '1', storeName: 'Brechó Linha do Tempo', amount: 18240 },
    { storeId: '2', storeName: 'Garimpo da Praça', amount: 14820.9 },
    { storeId: '3', storeName: 'Casa Reuso', amount: 11960 },
  ],
};

const ZERADO: AdminDashboardData = {
  storesCount: 0,
  usersCount: 0,
  activeProductsCount: 0,
  salesVolume: 0,
  commissionTotal: 0,
  salesByStore: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[paths.adminDashboard]}>
      <AuthContext.Provider value={ADMIN}>
        <AdminDashboard />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

/** O valor (`dd`) do cartão cujo rótulo (`dt`) é `label`. */
function valorDe(label: string) {
  const termo = screen.getByText(label, { selector: 'dt' });
  const valor = termo.parentElement?.querySelector('dd');
  if (!valor) throw new Error(`cartão "${label}" sem valor`);
  return valor;
}

const numeros = () => within(screen.getByRole('region', { name: 'Números da plataforma' }));
const vendasPorLoja = () => within(screen.getByRole('region', { name: 'Vendas por loja' }));

beforeEach(() => {
  vi.mocked(getDashboard).mockReset();
});

afterEach(cleanup);

describe('<AdminDashboard />', () => {
  it('com números: cinco cartões com rótulo e valor, e as vendas por loja', async () => {
    vi.mocked(getDashboard).mockResolvedValue(COM_VENDAS);
    renderPage();

    expect(
      await screen.findByRole('region', { name: 'Números da plataforma' }),
    ).toBeInTheDocument();
    expect(numeros().getAllByRole('term')).toHaveLength(5);
    expect(valorDe('Lojas na plataforma')).toHaveTextContent('7');
    expect(valorDe('Usuários cadastrados')).toHaveTextContent('1.520');
    expect(valorDe('Peças ativas no site')).toHaveTextContent('1.284');
    expect(valorDe('Valor total vendido no site')).toHaveTextContent('R$ 128.450,00');
    expect(valorDe('Valor retido pela Vintex (9%)')).toHaveTextContent('R$ 11.560,50');

    const lojas = vendasPorLoja().getAllByRole('listitem');
    expect(lojas).toHaveLength(3);
    expect(lojas[0]).toHaveTextContent('Brechó Linha do Tempo');
    expect(lojas[0]).toHaveTextContent('R$ 18.240,00');
    expect(lojas[1]).toHaveTextContent('Garimpo da Praça');
    expect(lojas[1]).toHaveTextContent('R$ 14.820,90');
    expect(getDashboard).toHaveBeenCalledTimes(1);
  });

  it('tem um único h1, "Painel geral", e mantém a navegação da área admin', async () => {
    vi.mocked(getDashboard).mockResolvedValue(COM_VENDAS);
    renderPage();

    await screen.findByRole('region', { name: 'Números da plataforma' });
    const titulos = screen.getAllByRole('heading', { level: 1 });
    expect(titulos).toHaveLength(1);
    expect(titulos[0]).toHaveTextContent('Painel geral');
    const nav = within(screen.getByRole('navigation', { name: 'Área administrativa' }));
    expect(nav.getByRole('link', { name: 'Painel geral' })).toHaveAttribute(
      'href',
      paths.adminDashboard,
    );
    expect(nav.getByRole('link', { name: 'Painel geral' })).toHaveAttribute('aria-current', 'page');
  });

  it('preserva a ordem de sales_by_store que o back devolveu', async () => {
    vi.mocked(getDashboard).mockResolvedValue({
      ...COM_VENDAS,
      salesByStore: [
        { storeId: '9', storeName: 'Ateliê Retalho', amount: 100 },
        { storeId: '4', storeName: 'Brechó da Redenção', amount: 500 },
        { storeId: '5', storeName: 'Casa Reuso', amount: 300 },
      ],
    });
    renderPage();

    await screen.findByRole('region', { name: 'Vendas por loja' });
    expect(
      vendasPorLoja()
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Ateliê Retalho'),
      expect.stringContaining('Brechó da Redenção'),
      expect.stringContaining('Casa Reuso'),
    ]);
  });

  it('zerada: cartões com zero e rótulo, e a lista por loja vazia com texto', async () => {
    vi.mocked(getDashboard).mockResolvedValue(ZERADO);
    renderPage();

    await screen.findByRole('region', { name: 'Números da plataforma' });
    expect(valorDe('Lojas na plataforma')).toHaveTextContent('0');
    expect(valorDe('Usuários cadastrados')).toHaveTextContent('0');
    expect(valorDe('Peças ativas no site')).toHaveTextContent('0');
    expect(valorDe('Valor total vendido no site')).toHaveTextContent('R$ 0,00');
    expect(valorDe('Valor retido pela Vintex (9%)')).toHaveTextContent('R$ 0,00');
    expect(vendasPorLoja().queryByRole('listitem')).not.toBeInTheDocument();
    expect(vendasPorLoja().getByText('Nenhuma venda ainda')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('carregando: esqueleto com status, sem cartões', () => {
    vi.mocked(getDashboard).mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('status', { name: 'Carregando o painel' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Números da plataforma' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Painel geral' })).toBeInTheDocument();
  });

  it('falha: erro com "Tentar de novo", que refaz a chamada; a navegação continua', async () => {
    const user = userEvent.setup();
    vi.mocked(getDashboard).mockRejectedValueOnce(new Error('rede fora'));
    renderPage();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar o painel.');
    expect(screen.getByRole('navigation', { name: 'Área administrativa' })).toBeInTheDocument();

    const request = deferred<AdminDashboardData>();
    vi.mocked(getDashboard).mockReturnValueOnce(request.promise);
    await user.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }));

    expect(getDashboard).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status', { name: 'Carregando o painel' })).toBeInTheDocument();
    await act(async () => request.resolve(COM_VENDAS));
    expect(valorDe('Lojas na plataforma')).toHaveTextContent('7');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // Onde o Figma e o back divergem, vale o back.
  it('não mostra os blocos de busca com IA nem "últimos 30 dias"', async () => {
    vi.mocked(getDashboard).mockResolvedValue(COM_VENDAS);
    const { container } = renderPage();

    await screen.findByRole('region', { name: 'Números da plataforma' });
    expect(container.textContent).not.toMatch(
      /buscas? com IA|termos mais buscados|convers[ãa]o|assistente|últimos 30 dias/i,
    );
  });

  it('não usa cor em hex cru nem dark:', async () => {
    vi.mocked(getDashboard).mockResolvedValue(COM_VENDAS);
    const { container } = renderPage();

    await screen.findByRole('region', { name: 'Números da plataforma' });
    await waitFor(() => expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/));
    expect(container.innerHTML).not.toMatch(/\bdark:/);
  });
});
