import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import OrderStatusTimeline from './OrderStatusTimeline';

afterEach(cleanup);

// Horários em UTC; São Paulo é UTC-3 o ano todo (sem horário de verão desde
// 2019), então 17:30Z vira 14:30 no texto, em qualquer máquina.
const history = [
  { status: 'aguardando_comprovante' as const, at: '2026-10-01T17:30:00Z' },
  { status: 'em_analise' as const, at: '2026-10-02T12:05:00Z' },
  { status: 'confirmado' as const, at: '2026-10-03T02:00:00Z' },
];

function getSteps() {
  return within(screen.getByRole('list')).getAllByRole('listitem');
}

// O conector também é aria-hidden; o marcador é o círculo.
function getMarker(step: HTMLElement) {
  return step.querySelector<HTMLElement>(':scope > [aria-hidden="true"].rounded-full');
}

describe('<OrderStatusTimeline />', () => {
  // Objetivo: etapas até a atual com data (dd/mm/aaaa hh:mm em São Paulo), demais futuras.
  it('com current = confirmado, mostra as três primeiras com data e as três últimas futuras', () => {
    render(<OrderStatusTimeline current="confirmado" history={history} />);

    const steps = getSteps();
    expect(steps).toHaveLength(6);
    expect(steps.map((step) => step.getAttribute('data-state'))).toEqual([
      'completed',
      'completed',
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);

    expect(within(steps[0]).getByText('Aguardando comprovante')).toBeInTheDocument();
    expect(within(steps[0]).getByText('01/10/2026 14:30')).toBeInTheDocument();
    expect(within(steps[1]).getByText('Comprovante em análise')).toBeInTheDocument();
    expect(within(steps[1]).getByText('02/10/2026 09:05')).toBeInTheDocument();
    // 02:00Z do dia 3 ainda é dia 2 em São Paulo.
    expect(within(steps[2]).getByText('Pagamento confirmado')).toBeInTheDocument();
    expect(within(steps[2]).getByText('02/10/2026 23:00')).toBeInTheDocument();

    expect(within(steps[3]).getByText('Preparando')).toBeInTheDocument();
    expect(within(steps[4]).getByText('Enviado')).toBeInTheDocument();
    expect(within(steps[5]).getByText('Concluído')).toBeInTheDocument();
  });

  it('marca só a etapa atual com aria-current="step"', () => {
    render(<OrderStatusTimeline current="confirmado" history={history} />);

    const steps = getSteps();
    expect(steps[2]).toHaveAttribute('aria-current', 'step');
    steps
      .filter((_, index) => index !== 2)
      .forEach((step) => expect(step).not.toHaveAttribute('aria-current'));
  });

  // Objetivo: mesmo que o history traga data de etapa futura, ela não aparece.
  it('não mostra data nas etapas futuras', () => {
    render(
      <OrderStatusTimeline
        current="confirmado"
        history={[...history, { status: 'enviado', at: '2026-10-05T15:00:00Z' }]}
      />,
    );

    const steps = getSteps();
    steps.slice(3).forEach((step) => {
      expect(step.querySelector('time')).toBeNull();
      expect(within(step).queryByText(/\d{2}\/\d{2}\/\d{4}/)).toBeNull();
    });
  });

  it('com current = expirado, mostra as etapas atingidas, o aviso e nenhuma etapa futura', () => {
    render(
      <OrderStatusTimeline
        current="expirado"
        history={[
          { status: 'aguardando_comprovante', at: '2026-10-01T17:30:00Z' },
          { status: 'expirado', at: '2026-10-04T17:30:00Z' },
        ]}
      />,
    );

    const steps = getSteps();
    expect(within(steps[0]).getByText('Aguardando comprovante')).toBeInTheDocument();
    expect(within(steps[0]).getByText('01/10/2026 14:30')).toBeInTheDocument();
    expect(screen.getByText('Pedido expirado')).toBeVisible();

    for (const label of [
      'Comprovante em análise',
      'Pagamento confirmado',
      'Preparando',
      'Enviado',
      'Concluído',
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(document.querySelector('[data-state="upcoming"]')).toBeNull();
    expect(document.querySelector('[aria-current]')).toBeNull();
  });

  it('com status repetido no history, usa a entrada mais recente (a última do array)', () => {
    render(
      <OrderStatusTimeline
        current="em_analise"
        history={[
          { status: 'aguardando_comprovante', at: '2026-10-01T17:30:00Z' },
          // Comprovante rejeitado: o Pedido volta e reenvia (RN-23).
          { status: 'aguardando_comprovante', at: '2026-10-02T13:00:00Z' },
          { status: 'em_analise', at: '2026-10-02T14:00:00Z' },
        ]}
      />,
    );

    const [first] = getSteps();
    expect(within(first).getByText('02/10/2026 10:00')).toBeInTheDocument();
    expect(within(first).queryByText('01/10/2026 14:30')).toBeNull();
  });

  it('não quebra com data inválida e omite a data dessa etapa', () => {
    expect(() =>
      render(
        <OrderStatusTimeline
          current="em_analise"
          history={[
            { status: 'aguardando_comprovante', at: 'não é data' },
            { status: 'em_analise', at: '2026-10-02T12:05:00Z' },
          ]}
        />,
      ),
    ).not.toThrow();

    const [first, second] = getSteps();
    expect(within(first).getByText('Aguardando comprovante')).toBeInTheDocument();
    expect(first.querySelector('time')).toBeNull();
    expect(within(second).getByText('02/10/2026 09:05')).toBeInTheDocument();
  });

  describe('marcadores (Figma Meus pedidos T11, node 1001:1421)', () => {
    it('pinta a etapa atual de dourado, com o número em branco-quente', () => {
      render(<OrderStatusTimeline current="confirmado" history={history} />);

      const marker = getMarker(getSteps()[2]);
      expect(marker).toHaveAttribute('aria-hidden', 'true');
      expect(marker).toHaveClass('bg-dourado', 'border-dourado', 'text-branco-quente');
      expect(marker).not.toHaveClass('bg-vermelho-escuro', 'border-vermelho-escuro');
      expect(marker).toHaveTextContent(/^3$/);
    });

    it('numera as futuras pela posição nas seis etapas, em texto-auxiliar sobre papel-profundo', () => {
      render(<OrderStatusTimeline current="preparando" history={history} />);

      const steps = getSteps();
      expect(getMarker(steps[3])).toHaveTextContent(/^4$/);
      [5, 6].forEach((number) => {
        const marker = getMarker(steps[number - 1]);
        expect(marker).toHaveAttribute('aria-hidden', 'true');
        expect(marker).toHaveTextContent(new RegExp(`^${number}$`));
        expect(marker).toHaveClass('text-texto-auxiliar', 'bg-papel-profundo', 'border-linha');
      });
    });

    it('mantém o check verde, sem número, nas concluídas', () => {
      render(<OrderStatusTimeline current="confirmado" history={history} />);

      const marker = getMarker(getSteps()[0]);
      expect(marker).toHaveClass('bg-verde-rs');
      expect(marker?.querySelector('svg')).not.toBeNull();
      expect(marker).toHaveTextContent(/^$/);
    });

    it('usa borda vermelho-escuro no aviso de expirado, não dourado', () => {
      render(
        <OrderStatusTimeline
          current="expirado"
          history={[{ status: 'aguardando_comprovante', at: '2026-10-01T17:30:00Z' }]}
        />,
      );

      const notice = screen.getByText('Pedido expirado').closest('li') as HTMLElement;
      const marker = getMarker(notice);
      expect(marker).toHaveClass('border-vermelho-escuro');
      expect(marker).not.toHaveClass('border-dourado', 'bg-dourado');
    });
  });

  // RN-83: sem prazo de entrega nem rastreio de transportadora.
  it('não mostra texto de prazo nem de rastreio', () => {
    const { container } = render(
      <OrderStatusTimeline
        current="enviado"
        history={[...history, { status: 'enviado', at: '2026-10-05T15:00:00Z' }]}
      />,
    );

    expect(container.textContent).not.toMatch(
      /prazo|previs|estimad|dias úteis|rastrei|rastreamento|transportadora|código de/i,
    );
  });
});
