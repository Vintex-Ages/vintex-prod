import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminReceiptError, listReceipts } from '@/services/adminReceiptService';
import ReceiptQueue from './ReceiptQueue';
import type { ReceiptReview } from '@/types/admin';

/**
 * Fixture de testes da fila de comprovantes (FE-US032-1). Só para testes:
 * `review({ orderId: '7', payment: { status: 'aprovado' } })`.
 */
function review(
  overrides: Partial<Omit<ReceiptReview, 'payment'>> & {
    payment?: Partial<ReceiptReview['payment']>;
  } = {},
): ReceiptReview {
  const { payment, ...rest } = overrides;
  return {
    orderId: '8921',
    buyer: { name: 'Ana Compradora', email: 'ana@exemplo.com' },
    store: { id: 's1', name: 'Brechó da Bia', pixKey: null },
    items: [
      {
        productId: '1',
        name: 'Jaqueta jeans',
        price: 159.9,
        coverImageUrl: null,
      },
    ],
    totalAmount: 159.9,
    platformFee: 14.39,
    sellerNetAmount: 145.51,
    ...rest,
    payment: {
      status: 'pendente',
      receiptUrl: '/api/admin/payments/8921/receipt',
      receiptType: 'image',
      submittedAt: '2026-10-01T10:00:00.000Z',
      ...payment,
    },
  };
}

vi.mock('@/services/adminReceiptService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/adminReceiptService')>()),
  listReceipts: vi.fn(),
}));

const page = (items = [review()]) => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
});

function renderPage(props: Parameters<typeof ReceiptQueue>[0] = {}) {
  return render(
    <MemoryRouter>
      <ReceiptQueue {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(listReceipts).mockReset().mockResolvedValue(page());
});

afterEach(cleanup);

describe('<ReceiptQueue />', () => {
  it('mostra o esqueleto enquanto carrega e depois a fila', async () => {
    renderPage();

    expect(screen.getByRole('status', { name: 'Carregando comprovantes' })).toBeInTheDocument();
    expect(await screen.findByText('#8921')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Carregando comprovantes' })).toBeNull();
  });

  it('tem título, filtros e busca', async () => {
    renderPage();
    await screen.findByText('#8921');

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    for (const name of ['Todos', 'Pendentes', 'Aprovados', 'Rejeitados']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
  });

  // Teste declarado na issue.
  it('filtro "Pendentes" chama o service com status=pendente', async () => {
    renderPage();
    await screen.findByText('#8921');

    await userEvent.click(screen.getByRole('button', { name: 'Pendentes' }));

    await waitFor(() =>
      expect(listReceipts).toHaveBeenLastCalledWith({
        status: 'pendente',
        q: undefined,
      }),
    );
    expect(screen.getByRole('button', { name: 'Pendentes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('busca por comprador ou loja chama o service com q', async () => {
    renderPage();
    await screen.findByText('#8921');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'bia{enter}');

    await waitFor(() =>
      expect(listReceipts).toHaveBeenLastCalledWith({
        status: undefined,
        q: 'bia',
      }),
    );
  });

  it('fila pendente vazia: "Nenhum comprovante pendente"', async () => {
    vi.mocked(listReceipts).mockResolvedValue(page([]));
    renderPage();
    await screen.findByText('Nenhum comprovante encontrado');

    await userEvent.click(screen.getByRole('button', { name: 'Pendentes' }));

    expect(await screen.findByText('Nenhum comprovante pendente')).toBeInTheDocument();
  });

  it('erro mostra ErrorState e "Tentar de novo" consulta de novo', async () => {
    vi.mocked(listReceipts).mockRejectedValueOnce(new Error('rede'));
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('#8921')).toBeInTheDocument();
  });

  it('403 mostra mensagem de sem permissão, sem tentar de novo', async () => {
    vi.mocked(listReceipts).mockRejectedValue(new AdminReceiptError('FORBIDDEN', 'x'));
    renderPage();

    expect(
      await screen.findByText('Você não tem permissão para ver os comprovantes.'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
  });

  it('"Ver comprovante" abre o detalhe sem sair da fila', async () => {
    renderPage({
      renderDetail: (item, onClose) => (
        <div role="dialog" aria-label={`Detalhe ${item.orderId}`}>
          <button onClick={onClose}>Fechar</button>
        </div>
      ),
    });

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Ver comprovante do pedido #8921',
      }),
    );

    expect(screen.getByRole('dialog', { name: 'Detalhe 8921' })).toBeInTheDocument();
    expect(screen.getByText('#8921')).toBeInTheDocument(); // a fila continua

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
