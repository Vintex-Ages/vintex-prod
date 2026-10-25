import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderSummary } from '@/types/order';
import OrderCard from './OrderCard';

afterEach(cleanup);

function makeOrder(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: 'ped-123',
    store: { id: 'loja-1', name: 'Brechó da Vó' },
    items: [
      {
        productId: 'p1',
        name: 'Jaqueta jeans',
        price: 1234.5,
        coverImageUrl: 'https://img.test/jaqueta.jpg',
      },
    ],
    totalAmount: 1234.5,
    status: 'aguardando_comprovante',
    payment: null,
    // 02:00Z do dia 3 ainda é dia 2 em São Paulo (UTC-3).
    createdAt: '2026-10-03T02:00:00Z',
    ...overrides,
  };
}

const extraItems = [
  { productId: 'p2', name: 'Saia midi', price: 50, coverImageUrl: null },
  { productId: 'p3', name: 'Cinto', price: 20, coverImageUrl: null },
];

describe('<OrderCard />', () => {
  it('renderiza loja, total, data e o badge da situação', () => {
    render(<OrderCard order={makeOrder()} onOpen={vi.fn()} />);

    expect(screen.getByText('Brechó da Vó')).toBeInTheDocument();
    // totalAmount vem em reais; o formatador do repo recebe centavos.
    expect(screen.getByText('R$ 1.234,50')).toBeInTheDocument();
    expect(screen.getByText('02/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Aguardando comprovante')).toBeInTheDocument();
    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();
  });

  it.each([
    ['em_analise', 'Comprovante em análise'],
    ['confirmado', 'Pagamento confirmado'],
    ['preparando', 'Preparando'],
    ['enviado', 'Enviado'],
    ['concluido', 'Concluído'],
  ] as const)('com status %s mostra o badge "%s"', (status, label) => {
    render(<OrderCard order={makeOrder({ status })} onOpen={vi.fn()} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('clicar na ação chama action.onClick e não chama onOpen', async () => {
    const onOpen = vi.fn();
    const onClick = vi.fn();
    render(
      <OrderCard
        order={makeOrder()}
        onOpen={onOpen}
        action={{ label: 'Enviar comprovante', onClick }}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  // Em jsdom o `::after` esticado não recebe clique; o alvo é o botão principal.
  it('clicar no cartão chama onOpen com o id do pedido', async () => {
    const onOpen = vi.fn();
    render(<OrderCard order={makeOrder()} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button', { name: /Pedido #ped-123/ }));

    expect(onOpen).toHaveBeenCalledWith('ped-123');
  });

  it('mostra "+N peças" com mais de uma peça e nada com uma só', () => {
    const { rerender } = render(
      <OrderCard
        order={makeOrder({ items: [...makeOrder().items, ...extraItems] })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('+2 peças')).toBeInTheDocument();

    rerender(<OrderCard order={makeOrder()} onOpen={vi.fn()} />);
    expect(screen.queryByText(/^\+\d+ peças?$/)).toBeNull();
  });

  it('com comprovante rejeitado mostra "Comprovante recusado" no lugar do badge do status', () => {
    render(
      <OrderCard
        order={makeOrder({
          status: 'aguardando_comprovante',
          payment: { status: 'rejeitado', rejectionReason: 'Valor diferente' },
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('Comprovante recusado')).toBeInTheDocument();
    expect(screen.queryByText('Aguardando comprovante')).toBeNull();
  });

  it('com status expirado mostra "Expirado"', () => {
    render(<OrderCard order={makeOrder({ status: 'expirado' })} onOpen={vi.fn()} />);

    expect(screen.getByText('Expirado')).toBeInTheDocument();
  });

  // #321: recusado e depois expirado — o Pedido acabou, a recusa ficou para trás.
  it('com status expirado e comprovante rejeitado mostra "Expirado", não "Comprovante recusado"', () => {
    render(
      <OrderCard
        order={makeOrder({
          status: 'expirado',
          payment: { status: 'rejeitado', rejectionReason: 'Valor diferente' },
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('Expirado')).toBeInTheDocument();
    expect(screen.queryByText('Comprovante recusado')).toBeNull();
  });

  it('sem action, não renderiza botão além do principal', () => {
    render(<OrderCard order={makeOrder()} onOpen={vi.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('com coverImageUrl null usa o placeholder de peça', () => {
    const { container } = render(
      <OrderCard
        order={makeOrder({
          items: [{ productId: 'p1', name: 'Jaqueta jeans', price: 10, coverImageUrl: null }],
        })}
        onOpen={vi.fn()}
      />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Jaqueta jeans' })).toBeInTheDocument();
  });

  // RN-83: sem prazo de entrega nem rastreio de transportadora.
  it('não mostra texto de prazo nem de rastreio', () => {
    const { container } = render(
      <OrderCard
        order={makeOrder({ status: 'enviado' })}
        onOpen={vi.fn()}
        action={{ label: 'Ver pedido', onClick: vi.fn() }}
      />,
    );

    expect(container.textContent).not.toMatch(
      /prazo|previs|estimad|dias úteis|rastrei|rastreamento|transportadora|código de/i,
    );
  });
});
