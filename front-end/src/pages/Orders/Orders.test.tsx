import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { paths } from '@/routes/paths';
import { listMyOrders } from '@/services/orderService';
import { reportOrder } from '@/services/reportService';
import type { OrderSummary } from '@/types/order';
import type { Paginated } from '@/types/product';
import Orders from './Orders';

vi.mock('@/services/orderService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/orderService')>()),
  listMyOrders: vi.fn(),
}));

vi.mock('@/services/reportService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/reportService')>()),
  reportOrder: vi.fn(),
}));

/** "Meus pedidos" (FE-US023-1, #321; VS-023 "Lista consolidada"). */

const AUTH: AuthContextValue = {
  user: { id: 'u_1', name: 'Ana', email: 'ana@exemplo.com', is_seller: false, is_admin: false },
  token: 't',
  isAuthenticated: true,
  loading: false,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
};

function pedido(id: string, overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id,
    store: { id: '5', name: 'Baú da Vó Nair' },
    items: [{ productId: '5', name: 'Calça jeans reta', price: 119.9, coverImageUrl: null }],
    totalAmount: 119.9,
    status: 'confirmado',
    payment: { status: 'aprovado', receiptName: 'pix.pdf' },
    // 15:00Z = 12:00 em São Paulo; a data do cartão é dd/mm/aaaa.
    createdAt: '2026-10-20T15:00:00.000Z',
    ...overrides,
  };
}

function pagina(items: OrderSummary[], page = 1, total = items.length): Paginated<OrderSummary> {
  return { items, page, pageSize: 20, total };
}

function renderOrders() {
  return render(
    <MemoryRouter initialEntries={[paths.orders]}>
      <AuthContext.Provider value={AUTH}>
        <Routes>
          <Route path={paths.orders} element={<Orders />} />
          <Route path={paths.orderDetail} element={<h1>Detalhe do pedido</h1>} />
          <Route path={paths.orderPayment} element={<h1>Pagamento do pedido</h1>} />
          <Route path={paths.catalog} element={<h1>Catálogo</h1>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function cartao(id: string) {
  const botao = screen.getByRole('button', { name: `Pedido #${id}` });
  const article = botao.closest('article');
  if (!article) throw new Error(`cartão ${id} não encontrado`);
  return article;
}

beforeEach(() => {
  vi.mocked(listMyOrders).mockReset();
  vi.mocked(reportOrder).mockReset();
});

afterEach(cleanup);

describe('<Orders />', () => {
  // Objetivo declarado 1.
  it('cada cartão mostra peça, loja, valor, data e situação', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(
      pagina([
        pedido('ped-2', { status: 'enviado' }),
        pedido('ped-1', {
          store: { id: '6', name: 'Desapego Serrano' },
          items: [{ productId: '9', name: 'Jaqueta biker', price: 149, coverImageUrl: null }],
          totalAmount: 149,
          createdAt: '2026-10-18T15:00:00.000Z',
        }),
      ]),
    );
    renderOrders();

    const primeiro = within(await screen.findByRole('list', { name: 'Pedidos' }));
    const itens = primeiro.getAllByRole('listitem');
    // Na ordem em que o service devolveu: o mais recente primeiro.
    expect(itens).toHaveLength(2);
    expect(within(itens[0]).getByRole('button', { name: 'Pedido #ped-2' })).toBeInTheDocument();

    const enviado = within(cartao('ped-2'));
    expect(enviado.getByText('Calça jeans reta')).toBeInTheDocument();
    expect(enviado.getByText('Baú da Vó Nair')).toBeInTheDocument();
    expect(enviado.getByText('R$ 119,90')).toBeInTheDocument();
    expect(enviado.getByText('20/10/2026')).toBeInTheDocument();
    expect(enviado.getByText('Enviado')).toBeInTheDocument();

    const confirmado = within(cartao('ped-1'));
    expect(confirmado.getByText('Jaqueta biker')).toBeInTheDocument();
    expect(confirmado.getByText('Desapego Serrano')).toBeInTheDocument();
    expect(confirmado.getByText('R$ 149,00')).toBeInTheDocument();
    expect(confirmado.getByText('18/10/2026')).toBeInTheDocument();
    expect(confirmado.getByText('Pagamento confirmado')).toBeInTheDocument();
    expect(listMyOrders).toHaveBeenCalledWith('u_1', 1);
  });

  // Objetivo declarado 2 (RN-23).
  it('Pedido com comprovante recusado oferece "Reenviar comprovante", que leva ao pagamento', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(
      pagina([
        pedido('ped-1', {
          status: 'aguardando_comprovante',
          payment: { status: 'rejeitado', rejectionReason: 'Valor diferente' },
        }),
      ]),
    );
    renderOrders();

    const card = within(await screen.findByRole('article'));
    expect(card.getByText('Comprovante recusado')).toBeInTheDocument();
    expect(card.queryByRole('button', { name: 'Enviar comprovante' })).not.toBeInTheDocument();

    fireEvent.click(card.getByRole('button', { name: 'Reenviar comprovante' }));

    expect(await screen.findByRole('heading', { name: 'Pagamento do pedido' })).toBeInTheDocument();
  });

  // Objetivo declarado 3.
  it('sem pedidos mostra o EmptyState com o CTA para o catálogo', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(pagina([]));
    renderOrders();

    expect(await screen.findByText('Você ainda não fez nenhum pedido')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Explorar o catálogo' }));

    expect(await screen.findByRole('heading', { name: 'Catálogo' })).toBeInTheDocument();
  });

  it('aguardando comprovante oferece "Enviar comprovante", sem abrir o detalhe', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(
      pagina([pedido('ped-1', { status: 'aguardando_comprovante', payment: null })]),
    );
    renderOrders();

    fireEvent.click(await screen.findByRole('button', { name: 'Enviar comprovante' }));

    expect(await screen.findByRole('heading', { name: 'Pagamento do pedido' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Detalhe do pedido' })).not.toBeInTheDocument();
  });

  it('expirado aparece como "Expirado" e sem ação de pagamento', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(
      pagina([pedido('ped-1', { status: 'expirado', payment: null })]),
    );
    renderOrders();

    const card = within(await screen.findByRole('article'));
    expect(card.getByText('Expirado')).toBeInTheDocument();
    expect(card.getAllByRole('button')).toHaveLength(1);
    expect(card.queryByRole('button', { name: /comprovante/i })).not.toBeInTheDocument();
  });

  it('pedido confirmado não tem ação de pagamento', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(pagina([pedido('ped-1')]));
    renderOrders();

    const card = within(await screen.findByRole('article'));
    // Além do cartão em si, só "Reportar problema" (#410): nada de pagamento.
    expect(card.getAllByRole('button').map((botao) => botao.textContent)).toEqual([
      'Pedido #ped-1',
      'Reportar problema',
    ]);
  });

  it('clicar no cartão abre o detalhe do pedido', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(pagina([pedido('ped-1')]));
    renderOrders();

    fireEvent.click(await screen.findByRole('button', { name: 'Pedido #ped-1' }));

    expect(await screen.findByRole('heading', { name: 'Detalhe do pedido' })).toBeInTheDocument();
  });

  it('"Carregar mais" acrescenta a próxima página e some quando acaba', async () => {
    vi.mocked(listMyOrders)
      .mockResolvedValueOnce(pagina([pedido('ped-3'), pedido('ped-2')], 1, 3))
      .mockResolvedValueOnce(pagina([pedido('ped-1')], 2, 3));
    renderOrders();

    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    expect(screen.getByRole('button', { name: 'Pedido #ped-3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
    expect(listMyOrders).toHaveBeenLastCalledWith('u_1', 2);
  });

  it('"Carregar mais" que falha avisa e mantém a lista', async () => {
    vi.mocked(listMyOrders)
      .mockResolvedValueOnce(pagina([pedido('ped-2')], 1, 2))
      .mockRejectedValueOnce(new Error('rede fora'));
    renderOrders();

    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/carregar mais pedidos/i);
    expect(screen.getByRole('button', { name: 'Pedido #ped-2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeEnabled();
  });

  it('mostra o skeleton enquanto carrega', async () => {
    vi.mocked(listMyOrders).mockReturnValue(new Promise(() => {}));
    renderOrders();

    expect(screen.getByRole('status', { name: 'Carregando pedidos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Meus pedidos' })).toBeInTheDocument();
  });

  it('falha na carga mostra o ErrorState, e "Tentar de novo" recarrega', async () => {
    vi.mocked(listMyOrders)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValueOnce(pagina([pedido('ped-1')]));
    renderOrders();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('button', { name: 'Pedido #ped-1' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // RN-83/RN-21: sem rastreio nem "tempo médio"; "Avaliar loja" é outra issue.
  it('não mostra rastreio, tempo médio nem avaliação', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(
      pagina([pedido('ped-1', { status: 'enviado' }), pedido('ped-2', { status: 'concluido' })]),
    );
    const { container } = renderOrders();
    await screen.findByRole('list', { name: 'Pedidos' });

    expect(container.textContent).not.toMatch(
      /rastrei|rastreamento|transportadora|tempo real|tempo médio|avaliar/i,
    );
  });

  // #410 (FE-US025-1), teste 5: "Reportar problema" nos 4 status válidos (RN-77).
  it.each(['confirmado', 'preparando', 'enviado', 'concluido'] as const)(
    'Pedido %s tem "Reportar problema" no cartão',
    async (status) => {
      vi.mocked(listMyOrders).mockResolvedValue(pagina([pedido('ped-1', { status })]));
      renderOrders();
      await screen.findByRole('list', { name: 'Pedidos' });

      expect(
        within(cartao('ped-1')).getByRole('button', { name: 'Reportar problema' }),
      ).toBeInTheDocument();
    },
  );

  // #410, teste 2: antes da confirmação ou expirado, sem o botão.
  it.each([
    ['aguardando_comprovante', null],
    ['em_analise', { status: 'pendente' as const, receiptName: 'pix.pdf' }],
    ['expirado', null],
  ] as const)('Pedido %s não tem "Reportar problema"', async (status, payment) => {
    vi.mocked(listMyOrders).mockResolvedValue(pagina([pedido('ped-1', { status, payment })]));
    renderOrders();
    await screen.findByRole('list', { name: 'Pedidos' });

    expect(
      within(cartao('ped-1')).queryByRole('button', { name: 'Reportar problema' }),
    ).not.toBeInTheDocument();
  });

  // Revisão do #410: com os services reais (mock), o Pedido de exemplo é reportável.
  it('reporta o Pedido de exemplo confirmado com os services reais do mock', async () => {
    window.sessionStorage.clear();
    const orders =
      await vi.importActual<typeof import('@/services/orderService')>('@/services/orderService');
    const report = await vi.importActual<typeof import('@/services/reportService')>(
      '@/services/reportService',
    );
    vi.mocked(listMyOrders).mockImplementation(orders.listMyOrders);
    vi.mocked(reportOrder).mockImplementation(report.reportOrder);
    renderOrders();
    await screen.findByRole('list', { name: 'Pedidos' });

    fireEvent.click(
      within(cartao('example-confirmado')).getByRole('button', { name: 'Reportar problema' }),
    );
    const dialogo = screen.getByRole('dialog', { name: 'Reportar problema' });
    fireEvent.change(within(dialogo).getByRole('combobox', { name: 'Motivo' }), {
      target: { value: 'nao_recebido' },
    });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Descrição' }), {
      target: { value: 'Não chegou.' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar reclamação' }));

    expect(await within(dialogo).findByRole('status')).toHaveTextContent(
      /enviada à administradora/i,
    );
    expect(within(dialogo).queryByRole('alert')).not.toBeInTheDocument();
    window.sessionStorage.clear();
  });

  // #410, teste 1: fluxo completo pelo cartão, sem abrir o detalhe.
  it('reporta um Pedido confirmado pelo cartão e vê só a confirmação', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(pagina([pedido('ped-1', { status: 'confirmado' })]));
    vi.mocked(reportOrder).mockResolvedValue({
      id: 'r_1',
      orderId: 'ped-1',
      reason: 'nao_recebido',
      description: 'Não chegou.',
      createdAt: '2026-10-29T12:00:00Z',
    });
    renderOrders();
    await screen.findByRole('list', { name: 'Pedidos' });

    fireEvent.click(within(cartao('ped-1')).getByRole('button', { name: 'Reportar problema' }));
    const dialogo = screen.getByRole('dialog', { name: 'Reportar problema' });
    fireEvent.change(within(dialogo).getByRole('combobox', { name: 'Motivo' }), {
      target: { value: 'nao_recebido' },
    });
    fireEvent.change(within(dialogo).getByRole('textbox', { name: 'Descrição' }), {
      target: { value: 'Não chegou.' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Enviar reclamação' }));

    expect(await within(dialogo).findByRole('status')).toHaveTextContent(
      /enviada à administradora/i,
    );
    expect(reportOrder).toHaveBeenCalledWith('ped-1', 'nao_recebido', 'Não chegou.');
    // Continua em "Meus pedidos": o clique na ação não abriu o detalhe.
    expect(screen.getByRole('heading', { level: 1, name: 'Meus pedidos' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // RN-78: nada da Reclamação fica exposto no Pedido.
    expect(screen.queryByText('Não chegou.')).not.toBeInTheDocument();
  });

  it('não usa nenhuma cor em hex cru', async () => {
    vi.mocked(listMyOrders).mockResolvedValue(pagina([pedido('ped-1')]));
    const { container } = renderOrders();
    await screen.findByRole('list', { name: 'Pedidos' });

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
