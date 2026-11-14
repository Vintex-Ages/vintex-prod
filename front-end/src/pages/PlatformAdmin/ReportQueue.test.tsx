import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { listReports, OrderReportError } from '@/services/reportService';
import type { AdminOrderReport } from '@/types/report';
import type { Paginated } from '@/types/product';
import ReportQueue from './ReportQueue';

vi.mock('@/services/reportService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/reportService')>()),
  listReports: vi.fn(),
}));

/** Reclamações na área da administradora (FE-US025-2, #427; RN-78). Só leitura. */

const AUTH: AuthContextValue = {
  user: {
    id: 'u_3',
    name: 'Eva Vieira',
    email: 'eva@exemplo.com',
    is_seller: false,
    is_admin: true,
  },
  token: 'token',
  isAuthenticated: true,
  loading: false,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
};

function reclamacao(id: string, overrides: Partial<AdminOrderReport> = {}): AdminOrderReport {
  return {
    id,
    orderId: `ped-${id}`,
    reason: 'danificado',
    description: `Descrição ${id}.`,
    createdAt: '2026-10-29T14:32:00',
    buyer: { id: 'u_1', name: 'Ana Compradora' },
    store: { id: 's_1', name: 'Brechó da Bia' },
    ...overrides,
  };
}

function pagina(
  items: AdminOrderReport[],
  page = 1,
  total = items.length,
): Paginated<AdminOrderReport> {
  return { items, page, pageSize: 20, total };
}

function renderQueue() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={AUTH}>
        <ReportQueue />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function itens() {
  return within(screen.getByRole('list', { name: 'Reclamações' })).getAllByRole('listitem');
}

beforeEach(() => {
  vi.mocked(listReports).mockReset();
});

afterEach(cleanup);

describe('<ReportQueue />', () => {
  it('tem o cabeçalho da área administrativa e o título "Reclamações"', async () => {
    vi.mocked(listReports).mockResolvedValue(pagina([]));
    renderQueue();

    expect(screen.getByRole('heading', { level: 1, name: 'Reclamações' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Área administrativa' })).toBeInTheDocument();
    await screen.findByText('Nenhuma reclamação recebida');
  });

  // Teste 5.
  it('mostra o esqueleto enquanto carrega', () => {
    vi.mocked(listReports).mockReturnValue(new Promise(() => {}));
    renderQueue();

    expect(screen.getByRole('status', { name: 'Carregando reclamações' })).toBeInTheDocument();
  });

  // Teste 1.
  it('lista as Reclamações na ordem do service, sem ações', async () => {
    vi.mocked(listReports).mockResolvedValue(
      pagina([
        reclamacao('2', {
          reason: 'nao_recebido',
          orderId: '42',
          buyer: { id: 'u_2', name: 'Bia' },
        }),
        reclamacao('1'),
      ]),
    );
    renderQueue();
    await screen.findByRole('list', { name: 'Reclamações' });

    const [primeira, segunda] = itens();
    expect(within(primeira).getByText('Não recebido')).toBeInTheDocument();
    expect(within(primeira).getByText('Descrição 2.')).toBeInTheDocument();
    expect(within(primeira).getByText('Pedido #42')).toBeInTheDocument();
    expect(within(primeira).getByText('Bia')).toBeInTheDocument();
    expect(within(segunda).getByText('Danificado')).toBeInTheDocument();
    expect(within(segunda).getByText('Brechó da Bia')).toBeInTheDocument();
    expect(listReports).toHaveBeenCalledWith({ page: 1 });

    // Só leitura: dentro da lista não há link (pedido alheio) nem botão.
    const lista = within(screen.getByRole('list', { name: 'Reclamações' }));
    expect(lista.queryByRole('link')).not.toBeInTheDocument();
    expect(lista.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resolver|responder|encerrar/i })).toBeNull();
  });

  // Teste 2.
  it('sem Reclamações mostra o EmptyState', async () => {
    vi.mocked(listReports).mockResolvedValue(pagina([]));
    renderQueue();

    expect(await screen.findByText('Nenhuma reclamação recebida')).toBeInTheDocument();
    expect(
      screen.getByText(/Quando um comprador reportar um problema num pedido/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Reclamações' })).not.toBeInTheDocument();
  });

  // Teste 3.
  it('falha mostra o erro, e "Tentar de novo" refaz a consulta', async () => {
    vi.mocked(listReports)
      .mockRejectedValueOnce(new OrderReportError('INTERNAL_ERROR', 'Erro ao processar.'))
      .mockResolvedValueOnce(pagina([reclamacao('1')]));
    renderQueue();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar as reclamações.');
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('list', { name: 'Reclamações' })).toBeInTheDocument();
    expect(listReports).toHaveBeenCalledTimes(2);
  });

  // Teste 4.
  it('403 mostra "Sem permissão" e não oferece tentar de novo', async () => {
    vi.mocked(listReports).mockRejectedValue(new OrderReportError('FORBIDDEN', 'Sem acesso.'));
    renderQueue();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Sem permissão');
    expect(within(alerta).queryByRole('button')).not.toBeInTheDocument();
  });

  // Teste 6.
  it('"Carregar mais" traz a próxima página e some quando acabou', async () => {
    vi.mocked(listReports)
      .mockResolvedValueOnce(pagina([reclamacao('3'), reclamacao('2')], 1, 3))
      .mockResolvedValueOnce(pagina([reclamacao('1')], 2, 3));
    renderQueue();
    await screen.findByRole('list', { name: 'Reclamações' });

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(itens()).toHaveLength(3));
    expect(listReports).toHaveBeenLastCalledWith({ page: 2 });
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('falha ao carregar mais avisa e mantém a lista', async () => {
    vi.mocked(listReports)
      .mockResolvedValueOnce(pagina([reclamacao('2')], 1, 2))
      .mockRejectedValueOnce(new Error('rede'));
    renderQueue();
    await screen.findByRole('list', { name: 'Reclamações' });

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar mais reclamações.',
    );
    expect(itens()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeEnabled();
  });

  it('não usa nenhuma cor em hex cru', async () => {
    vi.mocked(listReports).mockResolvedValue(pagina([reclamacao('1')]));
    const { container } = renderQueue();
    await screen.findByRole('list', { name: 'Reclamações' });

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
