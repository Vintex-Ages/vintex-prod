import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/context/ToastContext';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { paths } from '@/routes/paths';
import { getOrder, OrderError, submitReceipt } from '@/services/orderService';
import type { Order, PaymentStatus } from '@/types/order';
import OrderPayment from './OrderPayment';

vi.mock('@/services/orderService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/orderService')>()),
  getOrder: vi.fn(),
  submitReceipt: vi.fn(),
}));

/**
 * Pagamento do Pedido, etapa 2 de 2 (FE-US022-2, #320; VS-022): valor exato e
 * chave Pix do brechó, envio do comprovante e reenvio depois de uma recusa
 * (RN-23). A tela é por Pedido, então `getOrder` é a fonte de tudo.
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

function historico(statuses: Order['status'][]) {
  return statuses.map((status, indice) => ({
    status,
    at: `2026-10-0${indice + 1}T15:00:00.000Z`,
  }));
}

function makeOrder(
  overrides: Partial<Omit<Order, 'payment'>> & { payment?: Order['payment'] | PaymentStatus } = {},
): Order {
  const { payment, ...rest } = overrides;
  return {
    id: 'ped-1',
    store: { id: '5', name: 'Baú da Vó Nair', pixKey: PIX_KEY },
    items: [{ productId: '5', name: 'Calça jeans reta', price: 160, coverImageUrl: null }],
    productAmount: 160,
    platformFee: 14.4,
    totalAmount: 160,
    status: 'aguardando_comprovante',
    history: historico(['aguardando_comprovante']),
    deliveryAddress: {
      zipCode: '90010-000',
      street: 'Rua dos Andradas',
      number: '500',
      neighborhood: 'Centro Histórico',
      city: 'Porto Alegre',
      state: 'RS',
    },
    // Aceita o atalho `payment: 'rejeitado'` do teste; o contrato real é objeto.
    payment: typeof payment === 'string' ? { status: payment } : (payment ?? null),
    createdAt: '2026-10-01T15:00:00.000Z',
    expiresAt: '2026-10-04T15:00:00.000Z',
    ...rest,
  };
}

function renderPayment() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/profile/orders/ped-1/payment`]}>
        <AuthContext.Provider value={AUTH}>
          <Routes>
            <Route path={paths.orderPayment} element={<OrderPayment />} />
            <Route path={paths.orderDetail} element={<h1>Detalhe do pedido</h1>} />
            <Route path={paths.orders} element={<h1>Meus pedidos</h1>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function uploader() {
  return screen.getByLabelText('Comprovante do Pix');
}

function escolherComprovante(file: File) {
  fireEvent.change(uploader(), { target: { files: [file] } });
}

const PDF = () => new File(['comprovante'], 'comprovante-pix.pdf', { type: 'application/pdf' });
const JPEG = () => new File(['foto'], 'comprovante-pix.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.mocked(getOrder).mockReset();
  vi.mocked(submitReceipt).mockReset();
  vi.mocked(submitReceipt).mockResolvedValue(makeOrder({ status: 'em_analise' }));
  // jsdom não implementa `createObjectURL`; o MediaUploader usa na prévia.
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    configurable: true,
    value: (file: File) => `blob:${file.name}`,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<OrderPayment />', () => {
  // Objetivo declarado 1 (VS-022) e critério do PixPaymentCard.
  it('mostra o valor exato do Pedido, a chave Pix e o nome do brechó', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder({ totalAmount: 198.9 }));
    renderPayment();

    const card = within(await screen.findByRole('region', { name: 'Dados para pagamento Pix' }));
    expect(card.getByText('R$ 198,90', { exact: true })).toBeInTheDocument();
    expect(card.getByText(PIX_KEY, { exact: true })).toBeInTheDocument();
    expect(card.getByText('Baú da Vó Nair', { exact: true })).toBeInTheDocument();
    expect(card.getByText('Pedido #ped-1', { exact: true })).toBeInTheDocument();
    expect(getOrder).toHaveBeenCalledWith('u_1', 'ped-1');
  });

  it('"Copiar chave" confirma a cópia com um Toast', async () => {
    // `setup()` instala o stub de clipboard; o spy vem depois dele.
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    await user.click(screen.getByRole('button', { name: 'Copiar chave' }));

    expect(await screen.findByText('Chave Pix copiada')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(PIX_KEY);
  });

  // Objetivo declarado 1: enviar leva a "em análise".
  it('envia o comprovante e abre o detalhe do Pedido', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    const arquivo = JPEG();
    escolherComprovante(arquivo);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));

    expect(await screen.findByRole('heading', { name: 'Detalhe do pedido' })).toBeInTheDocument();
    expect(submitReceipt).toHaveBeenCalledTimes(1);
    expect(submitReceipt).toHaveBeenCalledWith('u_1', 'ped-1', arquivo);
  });

  it('desabilita o envio até o upload terminar', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    let concluir!: (order: Order) => void;
    vi.mocked(submitReceipt).mockReturnValue(
      new Promise<Order>((resolve) => {
        concluir = resolve;
      }),
    );
    renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    escolherComprovante(PDF());
    fireEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));

    const enviando = await screen.findByRole('button', { name: 'Enviando comprovante…' });
    expect(enviando).toBeDisabled();
    fireEvent.click(enviando);
    expect(submitReceipt).toHaveBeenCalledTimes(1);

    concluir(makeOrder({ status: 'em_analise' }));
    expect(await screen.findByRole('heading', { name: 'Detalhe do pedido' })).toBeInTheDocument();
  });

  // Objetivo declarado 2 (RN-23).
  it('comprovante recusado mostra o motivo, pede outro arquivo e aceita o reenvio', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        status: 'aguardando_comprovante',
        history: historico(['aguardando_comprovante', 'em_analise', 'aguardando_comprovante']),
        payment: {
          status: 'rejeitado',
          receiptName: 'comprovante-ilegivel.jpg',
          rejectionReason: 'Comprovante ilegível — reenvie uma foto nítida do Pix.',
        },
      }),
    );
    renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    const aviso = screen.getByRole('alert');
    expect(aviso).toHaveTextContent('Comprovante recusado');
    expect(aviso).toHaveTextContent('Comprovante ilegível — reenvie uma foto nítida do Pix.');
    expect(aviso).toHaveTextContent('Envie outro comprovante.');

    const arquivo = PDF();
    escolherComprovante(arquivo);
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar comprovante' }));

    expect(await screen.findByRole('heading', { name: 'Detalhe do pedido' })).toBeInTheDocument();
    expect(submitReceipt).toHaveBeenCalledWith('u_1', 'ped-1', arquivo);
  });

  it('recusa o envio sem arquivo, com aviso no próprio campo', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));

    expect(await screen.findByText('Anexe o comprovante para continuar.')).toBeInTheDocument();
    expect(uploader()).toHaveAccessibleDescription(/Anexe o comprovante para continuar\./);
    expect(submitReceipt).not.toHaveBeenCalled();
  });

  it('erro no upload avisa e mantém o arquivo escolhido', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    vi.mocked(submitReceipt).mockRejectedValue(
      new OrderError('RECEIPT_TOO_LARGE', 'O comprovante passa de 8 MiB.'),
    );
    renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    escolherComprovante(PDF());
    fireEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('O comprovante passa de 8 MiB.');
    expect(screen.getByText('comprovante-pix.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar comprovante' })).toBeEnabled();
  });

  // Objetivo declarado 3: não se paga duas vezes.
  it('Pedido que já saiu de aguardando comprovante abre o detalhe', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        status: 'em_analise',
        history: historico(['aguardando_comprovante', 'em_analise']),
        payment: { status: 'pendente', receiptName: 'comprovante-pix.pdf' },
      }),
    );
    renderPayment();

    expect(await screen.findByRole('heading', { name: 'Detalhe do pedido' })).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Dados para pagamento Pix' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar comprovante' })).not.toBeInTheDocument();
  });

  it('409 no envio trata o Pedido como fora da etapa e abre o detalhe', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    vi.mocked(submitReceipt).mockRejectedValue(
      new OrderError('ORDER_NOT_AWAITING_RECEIPT', 'Este Pedido não está aguardando comprovante.'),
    );
    renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    escolherComprovante(PDF());
    fireEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));

    expect(await screen.findByRole('heading', { name: 'Detalhe do pedido' })).toBeInTheDocument();
  });

  it('Pedido expirado explica o prazo e as peças, sem oferecer pagamento', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        status: 'expirado',
        history: [
          { status: 'aguardando_comprovante', at: '2026-10-01T15:00:00.000Z' },
          { status: 'expirado', at: '2026-10-04T15:00:00.000Z' },
        ],
      }),
    );
    renderPayment();

    expect(await screen.findByRole('heading', { name: 'Pedido expirado' })).toBeInTheDocument();
    expect(screen.getByText(/peças voltaram a ficar disponíveis/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Dados para pagamento Pix' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /comprovante/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver detalhe do pedido' })).toHaveAttribute(
      'href',
      '/profile/orders/ped-1',
    );
  });

  it('mostra o prazo para enviar o comprovante', async () => {
    // expiresAt 2026-10-04T15:00Z = 12:00 em São Paulo.
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    expect(screen.getByText(/04\/10\/2026 12:00/)).toBeInTheDocument();
  });

  it('Pedido de outro usuário mostra o ErrorState, sem tentar de novo', async () => {
    vi.mocked(getOrder).mockRejectedValue(new OrderError('ORDER_NOT_FOUND', 'não encontrado'));
    renderPayment();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Pedido não encontrado');
    expect(within(alerta).queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Pagamento do pedido' }),
    ).toBeInTheDocument();
  });

  it('outra falha na carga mostra o ErrorState com "Tentar de novo"', async () => {
    vi.mocked(getOrder)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValueOnce(makeOrder());
    renderPayment();

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));

    expect(
      await screen.findByRole('region', { name: 'Dados para pagamento Pix' }),
    ).toBeInTheDocument();
  });

  it('não entra custódia, Banrisul, liberação imediata nem QR Code', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    const { container } = renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    expect(container.textContent).not.toMatch(/custódia|banrisul|liberação imediata|qr\s*code/i);
  });

  it('não usa nenhuma cor em hex cru', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    const { container } = renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  it('mantém o estado de carregamento explícito', async () => {
    vi.mocked(getOrder).mockReturnValue(new Promise(() => {}));
    renderPayment();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando o pedido...');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Pagamento do pedido' }),
    ).toBeInTheDocument();
  });

  it('a volta para "Meus pedidos" está sempre disponível', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    fireEvent.click(screen.getByRole('link', { name: /Voltar para Meus pedidos/ }));

    expect(await screen.findByRole('heading', { name: 'Meus pedidos' })).toBeInTheDocument();
  });

  it('explica que o comprovante pode ser imagem ou PDF até 8 MB', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderPayment();
    await screen.findByRole('region', { name: 'Dados para pagamento Pix' });

    expect(uploader()).toHaveAttribute('accept', 'image/png,image/jpeg,application/pdf');
    expect(screen.getByText(/até 8 MB/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
