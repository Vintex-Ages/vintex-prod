import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { paths, productDetail, storeProfile } from '@/routes/paths';
import { getOrder, OrderError } from '@/services/orderService';
import type { Order, OrderStatus } from '@/types/order';
import OrderDetail from './OrderDetail';

vi.mock('@/services/orderService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/orderService')>()),
  getOrder: vi.fn(),
}));

/**
 * Detalhe do Pedido (FE-US023-2, #322). As datas estão em UTC; São Paulo é
 * UTC-3, então 15:00Z aparece como 12:00 em qualquer máquina.
 */

const AUTH: AuthContextValue = {
  user: { id: 'u_1', name: 'Ana', email: 'ana@exemplo.com', is_seller: false, is_admin: false },
  token: 't',
  isAuthenticated: true,
  loading: false,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
};

const PIX_KEY = 'baudavonair@vintex.com';

function historico(statuses: OrderStatus[]) {
  return statuses.map((status, indice) => ({
    status,
    at: `2026-10-0${indice + 1}T15:00:00.000Z`,
  }));
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ped-1',
    store: { id: '5', name: 'Baú da Vó Nair', pixKey: PIX_KEY },
    items: [
      { productId: '5', name: 'Calça jeans reta', price: 119.9, coverImageUrl: null },
      { productId: '8', name: 'Blusa de linho', price: 40.1, coverImageUrl: '/img/blusa.jpg' },
    ],
    productAmount: 160,
    platformFee: 14.4,
    totalAmount: 160,
    status: 'aguardando_comprovante',
    history: historico(['aguardando_comprovante']),
    deliveryAddress: {
      zipCode: '90010-000',
      street: 'Rua dos Andradas',
      number: '500',
      complement: 'Ap. 302',
      neighborhood: 'Centro Histórico',
      city: 'Porto Alegre',
      state: 'RS',
    },
    payment: null,
    createdAt: '2026-10-01T15:00:00.000Z',
    expiresAt: '2026-10-04T15:00:00.000Z',
    ...overrides,
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/profile/orders/ped-1']}>
      <AuthContext.Provider value={AUTH}>
        <Routes>
          <Route path={paths.orderDetail} element={<OrderDetail />} />
          <Route path={paths.orderPayment} element={<h1>Pagamento do pedido</h1>} />
          <Route path={paths.orders} element={<h1>Meus pedidos</h1>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

async function pronto() {
  await screen.findByRole('region', { name: 'Andamento do pedido' });
}

function etapas() {
  return within(screen.getByRole('region', { name: 'Andamento do pedido' })).getAllByRole(
    'listitem',
  );
}

beforeEach(() => {
  vi.mocked(getOrder).mockReset();
});

afterEach(cleanup);

describe('<OrderDetail />', () => {
  // Objetivo declarado 1: a data de cada etapa atingida é registrada.
  it('Pedido enviado mostra as cinco etapas atingidas com data', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        status: 'enviado',
        history: historico([
          'aguardando_comprovante',
          'em_analise',
          'confirmado',
          'preparando',
          'enviado',
        ]),
        payment: { status: 'aprovado', receiptName: 'pix.pdf' },
      }),
    );
    renderDetail();
    await pronto();

    const lista = etapas();
    const esperado = [
      ['Aguardando comprovante', '01/10/2026 12:00'],
      ['Comprovante em análise', '02/10/2026 12:00'],
      ['Pagamento confirmado', '03/10/2026 12:00'],
      ['Preparando', '04/10/2026 12:00'],
      ['Enviado', '05/10/2026 12:00'],
    ];
    esperado.forEach(([rotulo, data], indice) => {
      expect(within(lista[indice]).getByText(rotulo)).toBeInTheDocument();
      expect(within(lista[indice]).getByText(data)).toBeInTheDocument();
    });
    expect(lista[4]).toHaveAttribute('aria-current', 'step');
    expect(lista[5].querySelector('time')).toBeNull();
    expect(getOrder).toHaveBeenCalledWith('u_1', 'ped-1');
  });

  // Objetivo declarado 2: RN-23.
  it('comprovante rejeitado mostra o motivo e "Reenviar comprovante" leva ao pagamento', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        payment: {
          status: 'rejeitado',
          receiptName: 'pix.jpg',
          rejectionReason: 'Valor diferente do total do Pedido.',
        },
      }),
    );
    renderDetail();
    await pronto();

    expect(screen.getByText('Valor diferente do total do Pedido.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar comprovante' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar comprovante' }));

    expect(await screen.findByRole('heading', { name: 'Pagamento do pedido' })).toBeInTheDocument();
  });

  it('aguardando comprovante sem rejeição mostra "Enviar comprovante" e o prazo', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderDetail();
    await pronto();

    // expiresAt 2026-10-04T15:00Z = 12:00 em São Paulo.
    expect(screen.getByText(/04\/10\/2026 12:00/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar comprovante' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));

    expect(await screen.findByRole('heading', { name: 'Pagamento do pedido' })).toBeInTheDocument();
  });

  it('expirado avisa uma vez só, explica e não oferece pagamento', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        status: 'expirado',
        history: [
          { status: 'aguardando_comprovante', at: '2026-10-01T15:00:00.000Z' },
          { status: 'expirado', at: '2026-10-04T15:00:00.000Z' },
        ],
      }),
    );
    renderDetail();
    await pronto();

    // O texto é da linha do tempo; a página não repete.
    expect(screen.getAllByText('Pedido expirado')).toHaveLength(1);
    expect(screen.getByText(/peças voltaram a ficar disponíveis/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /comprovante/i })).not.toBeInTheDocument();
  });

  it('a loja e cada peça levam às suas páginas', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderDetail();
    await pronto();

    expect(screen.getByRole('link', { name: 'Baú da Vó Nair' })).toHaveAttribute(
      'href',
      storeProfile('5'),
    );
    expect(screen.getByRole('link', { name: 'Calça jeans reta' })).toHaveAttribute(
      'href',
      productDetail('5'),
    );
    expect(screen.getByRole('link', { name: 'Blusa de linho' })).toHaveAttribute(
      'href',
      productDetail('8'),
    );
  });

  it('mostra o endereço com os rótulos CEP e Bairro, e o total', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderDetail();
    await pronto();

    const endereco = screen.getByRole('region', { name: 'Endereço de entrega' });
    expect(within(endereco).getByText('CEP')).toBeInTheDocument();
    expect(within(endereco).getByText('90010-000')).toBeInTheDocument();
    expect(within(endereco).getByText('Bairro')).toBeInTheDocument();
    expect(within(endereco).getByText('Centro Histórico')).toBeInTheDocument();
    expect(within(endereco).getByText(/Rua dos Andradas, 500/)).toBeInTheDocument();
    expect(screen.getByText('R$ 160,00')).toBeInTheDocument();
  });

  it('mostra o nome e a situação do comprovante, nunca o arquivo', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        status: 'em_analise',
        history: historico(['aguardando_comprovante', 'em_analise']),
        payment: {
          status: 'pendente',
          receiptName: 'comprovante-pix.pdf',
          submittedAt: '2026-10-02T15:00:00.000Z',
        },
      }),
    );
    const { container } = renderDetail();
    await pronto();

    const comprovante = screen.getByRole('region', { name: 'Comprovante' });
    expect(within(comprovante).getByText('comprovante-pix.pdf')).toBeInTheDocument();
    expect(within(comprovante).getByText('Em análise')).toBeInTheDocument();
    expect(within(comprovante).queryByRole('link')).not.toBeInTheDocument();
    expect(within(comprovante).queryByRole('img')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/comprovante-pix\.pdf"/);
  });

  it('não mostra a chave Pix nem a comissão do vendedor', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    const { container } = renderDetail();
    await pronto();

    expect(container.textContent).not.toContain(PIX_KEY);
    expect(container.textContent).not.toMatch(/comiss|taxa/i);
    expect(container.textContent).not.toContain('R$ 14,40');
  });

  // RN-83: sem rastreio de transportadora. "Avaliar loja"/"Reportar problema" são Sprint 4.
  it('não mostra rastreio, avaliação nem reporte', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        status: 'enviado',
        history: historico([
          'aguardando_comprovante',
          'em_analise',
          'confirmado',
          'preparando',
          'enviado',
        ]),
      }),
    );
    const { container } = renderDetail();
    await pronto();

    expect(container.textContent).not.toMatch(
      /rastrei|rastreamento|transportadora|código de|avaliar|reportar/i,
    );
  });

  it('Pedido inexistente ou de outro usuário mostra o ErrorState, sem tentar de novo', async () => {
    vi.mocked(getOrder).mockRejectedValue(new OrderError('ORDER_NOT_FOUND', 'não encontrado'));
    renderDetail();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Pedido não encontrado');
    expect(within(alerta).queryByRole('button')).not.toBeInTheDocument();
    // O título da página fica, para o leitor de tela saber onde está.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Detalhe do pedido' }),
    ).toBeInTheDocument();
  });

  it('outra falha mostra o ErrorState com "Tentar de novo"', async () => {
    vi.mocked(getOrder)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValue(makeOrder());
    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));

    await pronto();
    expect(screen.getByRole('button', { name: 'Enviar comprovante' })).toBeInTheDocument();
  });

  it('recarrega ao voltar à aba e mostra a nova situação', async () => {
    vi.mocked(getOrder)
      .mockResolvedValueOnce(makeOrder())
      .mockResolvedValueOnce(
        makeOrder({
          status: 'em_analise',
          history: historico(['aguardando_comprovante', 'em_analise']),
          payment: { status: 'pendente', receiptName: 'pix.pdf' },
        }),
      );
    renderDetail();
    await pronto();
    expect(screen.getByRole('button', { name: 'Enviar comprovante' })).toBeInTheDocument();

    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Enviar comprovante' })).not.toBeInTheDocument(),
    );
    expect(etapas()[1]).toHaveAttribute('aria-current', 'step');
  });

  it('não usa nenhuma cor em hex cru', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    const { container } = renderDetail();
    await pronto();

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
