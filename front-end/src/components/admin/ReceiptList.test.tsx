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
  it('mostra Pedido, peça, comprador (nome e contato), vendedor, valor e status', () => {
    render(
      <ReceiptList
        items={[
          review({
            store: { id: 's1', name: 'Brechó da Bia', sellerName: 'Bia Souza', pixKey: null },
          }),
        ]}
        onViewReceipt={() => {}}
      />,
    );

    const row = screen.getByRole('row', { name: /#8921/ });
    expect(within(row).getByText('#8921')).toBeInTheDocument();
    expect(within(row).getAllByText('Jaqueta jeans').length).toBeGreaterThan(0);
    expect(within(row).getByText(/Comprador:/)).toBeInTheDocument();
    expect(within(row).getByText('Ana Compradora')).toBeInTheDocument();
    expect(within(row).getByText('ana@exemplo.com')).toBeInTheDocument();
    expect(within(row).getByText(/Vendedor:/)).toBeInTheDocument();
    expect(within(row).getByText('Bia Souza · Brechó da Bia')).toBeInTheDocument();
    expect(within(row).getByText('Valor do pedido')).toBeInTheDocument();
    expect(within(row).getByText(/159,90/)).toBeInTheDocument();
    expect(within(row).getByText('Pendente de validação')).toBeInTheDocument();
  });

  it('com mais de uma peça, mostra a primeira e "+N peças"', () => {
    const extra = { productId: '2', name: 'Calça', price: 10, coverImageUrl: null };
    render(
      <ReceiptList
        items={[review({ items: [review().items[0], extra, { ...extra, productId: '3' }] })]}
        onViewReceipt={() => {}}
      />,
    );

    expect(screen.getAllByText(/Jaqueta jeans/).length).toBeGreaterThan(0);
    expect(screen.getByText('+2 peças')).toBeInTheDocument();
  });

  it('com uma peça a mais, usa o singular', () => {
    const extra = { productId: '2', name: 'Calça', price: 10, coverImageUrl: null };
    render(
      <ReceiptList
        items={[review({ items: [review().items[0], extra] })]}
        onViewReceipt={() => {}}
      />,
    );

    expect(screen.getByText('+1 peça')).toBeInTheDocument();
  });

  it('tem as colunas do Figma', () => {
    render(<ReceiptList items={[review()]} onViewReceipt={() => {}} />);

    for (const name of [
      'Pedido',
      'Comprador',
      'Vendedor / Loja',
      'Valor',
      'Status',
      'Comprovante',
    ]) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    }
  });

  it('mostra telefone e e-mail do comprador quando há os dois', () => {
    render(
      <ReceiptList
        items={[review({ buyer: { name: 'Caio', email: 'caio@x.com', phone: '(51) 99999-0000' } })]}
        onViewReceipt={() => {}}
      />,
    );

    expect(screen.getByText('(51) 99999-0000')).toBeInTheDocument();
    expect(screen.getByText('caio@x.com')).toBeInTheDocument();
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

  // Figma mobile: o cartão inteiro é a área de clique e não há botão visível;
  // o botão aparece só a partir do tablet.
  it('no celular o botão cobre o cartão invisível; no tablet fica visível', () => {
    render(<ReceiptList items={[review()]} onViewReceipt={() => {}} />);

    const button = screen.getByRole('button', { name: 'Ver comprovante do pedido #8921' });

    expect(button).toHaveClass('opacity-0', 'h-full', 'w-full');
    expect(button).toHaveClass('tablet:opacity-100', 'tablet:h-auto', 'tablet:w-auto');
    expect(button.parentElement).toHaveClass('absolute', 'inset-0', 'tablet:static');
  });

  // Na tabela (tablet+) cada célula tem de cair sob o seu cabeçalho.
  it('as células da linha seguem a ordem dos cabeçalhos da tabela', () => {
    render(<ReceiptList items={[review()]} onViewReceipt={() => {}} />);

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    const row = screen.getAllByRole('row')[1];
    const cells = Array.from(row.querySelectorAll('td')).filter(
      (td) => !td.classList.contains('tablet:hidden'),
    );

    expect(headers).toEqual([
      'Pedido',
      'Comprador',
      'Vendedor / Loja',
      'Valor',
      'Status',
      'Comprovante',
    ]);
    expect(cells).toHaveLength(headers.length);
    expect(cells[1]).toHaveTextContent('Ana Compradora');
    expect(cells[3]).toHaveTextContent('R$');
    expect(cells[4]).toHaveTextContent('Pendente de validação');
    expect(cells[5]).toContainElement(screen.getByRole('button'));
  });
});
