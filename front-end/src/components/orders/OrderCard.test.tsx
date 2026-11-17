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

  // #424: quem decide quais ações valem para o Pedido é a página, não o cartão.
  describe('ações de pós-venda', () => {
    const REVIEW = 'Avaliar loja';
    const REPORT = 'Reportar problema';

    it('com as duas ações mostra os dois botões', () => {
      render(
        <OrderCard
          order={makeOrder()}
          onOpen={vi.fn()}
          afterSaleActions={{
            primary: { label: REVIEW, onClick: vi.fn() },
            secondary: { label: REPORT, onClick: vi.fn() },
          }}
        />,
      );

      expect(screen.getByRole('button', { name: REVIEW })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: REPORT })).toBeInTheDocument();
      expect(screen.getAllByRole('button')).toHaveLength(3);
    });

    it('só com a principal não mostra a secundária', () => {
      render(
        <OrderCard
          order={makeOrder()}
          onOpen={vi.fn()}
          afterSaleActions={{ primary: { label: REVIEW, onClick: vi.fn() } }}
        />,
      );

      expect(screen.getByRole('button', { name: REVIEW })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: REPORT })).toBeNull();
    });

    it('só com a secundária não mostra a principal', () => {
      render(
        <OrderCard
          order={makeOrder()}
          onOpen={vi.fn()}
          afterSaleActions={{ secondary: { label: REPORT, onClick: vi.fn() } }}
        />,
      );

      expect(screen.getByRole('button', { name: REPORT })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: REVIEW })).toBeNull();
    });

    it('sem nenhuma ação, ou com o objeto vazio, o cartão fica igual ao de hoje', () => {
      const today = render(<OrderCard order={makeOrder()} onOpen={vi.fn()} />);
      const todayHtml = today.container.innerHTML;
      expect(screen.getAllByRole('button')).toHaveLength(1);
      today.unmount();

      const { container } = render(
        <OrderCard order={makeOrder()} onOpen={vi.fn()} afterSaleActions={{}} />,
      );

      // Igualdade do HTML pega também um grupo vazio, que somaria um `gap` no cartão.
      expect(container.innerHTML).toBe(todayHtml);
    });

    it.each([
      ['principal', REVIEW, REPORT],
      ['secundária', REPORT, REVIEW],
    ] as const)(
      'clicar na %s chama só o onClick dela e não chama onOpen',
      async (_kind, label, other) => {
        const onOpen = vi.fn();
        const handlers = { [REVIEW]: vi.fn(), [REPORT]: vi.fn() };
        render(
          <OrderCard
            order={makeOrder()}
            onOpen={onOpen}
            afterSaleActions={{
              primary: { label: REVIEW, onClick: handlers[REVIEW] },
              secondary: { label: REPORT, onClick: handlers[REPORT] },
            }}
          />,
        );

        await userEvent.click(screen.getByRole('button', { name: label }));

        expect(handlers[label]).toHaveBeenCalledTimes(1);
        expect(handlers[other]).not.toHaveBeenCalled();
        expect(onOpen).not.toHaveBeenCalled();
      },
    );

    it('clicar no cartão continua chamando onOpen e não dispara as ações', async () => {
      const onOpen = vi.fn();
      const onReview = vi.fn();
      const onReport = vi.fn();
      render(
        <OrderCard
          order={makeOrder()}
          onOpen={onOpen}
          afterSaleActions={{
            primary: { label: REVIEW, onClick: onReview },
            secondary: { label: REPORT, onClick: onReport },
          }}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: /Pedido #ped-123/ }));

      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onOpen).toHaveBeenCalledWith('ped-123');
      expect(onReview).not.toHaveBeenCalled();
      expect(onReport).not.toHaveBeenCalled();
    });

    it('com action e as ações de pós-venda juntas, os três botões funcionam isolados', async () => {
      const onOpen = vi.fn();
      const onAction = vi.fn();
      const onReview = vi.fn();
      const onReport = vi.fn();
      render(
        <OrderCard
          order={makeOrder()}
          onOpen={onOpen}
          action={{ label: 'Enviar comprovante', onClick: onAction }}
          afterSaleActions={{
            primary: { label: REVIEW, onClick: onReview },
            secondary: { label: REPORT, onClick: onReport },
          }}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onReview).not.toHaveBeenCalled();
      expect(onReport).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: REVIEW }));
      expect(onReview).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onReport).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: REPORT }));
      expect(onReport).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onReview).toHaveBeenCalledTimes(1);

      expect(onOpen).not.toHaveBeenCalled();
    });

    it('o nome acessível de cada ação vem do label recebido', () => {
      render(
        <OrderCard
          order={makeOrder()}
          onOpen={vi.fn()}
          afterSaleActions={{
            primary: { label: 'Rótulo principal', onClick: vi.fn() },
            secondary: { label: 'Rótulo secundário', onClick: vi.fn() },
          }}
        />,
      );

      expect(screen.getByRole('button', { name: 'Rótulo principal' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Rótulo secundário' })).toBeInTheDocument();
    });

    // Em jsdom não há layout: o que dá para travar é o contrato de classes e a árvore.
    it('as ações ficam acima do ::after, fora do botão do cartão e abaixo do resumo', () => {
      render(
        <OrderCard
          order={makeOrder()}
          onOpen={vi.fn()}
          afterSaleActions={{
            primary: { label: REVIEW, onClick: vi.fn() },
            secondary: { label: REPORT, onClick: vi.fn() },
          }}
        />,
      );

      const cardButton = screen.getByRole('button', { name: /Pedido #ped-123/ });
      const total = screen.getByText('R$ 1.234,50');

      for (const label of [REVIEW, REPORT]) {
        const button = screen.getByRole('button', { name: label });
        expect(button).toHaveClass('relative', 'z-10', 'w-full', 'tablet:w-auto');
        expect(cardButton).not.toContainElement(button);
        expect(total.compareDocumentPosition(button)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      }
    });

    it('a principal é cheia e a secundária tem contorno', () => {
      render(
        <OrderCard
          order={makeOrder()}
          onOpen={vi.fn()}
          afterSaleActions={{
            primary: { label: REVIEW, onClick: vi.fn() },
            secondary: { label: REPORT, onClick: vi.fn() },
          }}
        />,
      );

      expect(screen.getByRole('button', { name: REVIEW })).toHaveClass('bg-vermelho-escuro');
      const report = screen.getByRole('button', { name: REPORT });
      expect(report).toHaveClass('border-vermelho-escuro', 'bg-transparent');
      expect(report).not.toHaveClass('bg-vermelho-escuro');
    });
  });
});
