import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceiptList } from './ReceiptList';
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

afterEach(cleanup);

describe('<ReceiptList />', () => {
  it('mostra Pedido, comprador (nome e contato), loja, valor e status', () => {
    render(<ReceiptList items={[review()]} onViewReceipt={() => {}} />);

    const row = screen.getByRole('row', { name: /#8921/ });
    expect(within(row).getByText('#8921')).toBeInTheDocument();
    expect(within(row).getByText('Ana Compradora')).toBeInTheDocument();
    expect(within(row).getByText('ana@exemplo.com')).toBeInTheDocument();
    expect(within(row).getByText('Brechó da Bia')).toBeInTheDocument();
    expect(within(row).getByText(/159,90/)).toBeInTheDocument();
    expect(within(row).getByText('Pendente')).toBeInTheDocument();
  });

  it('usa o telefone como contato quando não há e-mail', () => {
    render(
      <ReceiptList
        items={[
          review({
            buyer: { name: 'Caio', email: '', phone: '(51) 99999-0000' },
          }),
        ]}
        onViewReceipt={() => {}}
      />,
    );

    expect(screen.getByText('(51) 99999-0000')).toBeInTheDocument();
  });

  it('"Ver comprovante" entrega o item clicado', async () => {
    const onViewReceipt = vi.fn();
    const second = review({ orderId: '9000' });
    render(<ReceiptList items={[review(), second]} onViewReceipt={onViewReceipt} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver comprovante do pedido #9000' }));

    expect(onViewReceipt).toHaveBeenCalledWith(second);
  });
});
