import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import StatCard from './StatCard';

afterEach(cleanup);

describe('<StatCard />', () => {
  it('renderiza rótulo, valor e hint', () => {
    render(<StatCard label="Peças ativas" value="12" hint="nos últimos 30 dias" />);

    expect(screen.getByText('Peças ativas')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('nos últimos 30 dias')).toBeTruthy();
  });

  it('não quebra sem hint nem icon (ambos opcionais)', () => {
    render(<StatCard label="Vendas" value="R$ 1.200,00" />);

    expect(screen.getByText('Vendas')).toBeTruthy();
    expect(screen.getByText('R$ 1.200,00')).toBeTruthy();
  });

  it('renderiza o icon quando fornecido', () => {
    render(<StatCard label="Peças ativas" value="12" icon={<span data-testid="icone" />} />);

    expect(screen.getByTestId('icone')).toBeTruthy();
  });

  it('highlight aplica a cor de confiança no valor', () => {
    render(<StatCard label="Você recebeu" value="R$ 340,00" highlight />);

    const value = screen.getByText('R$ 340,00');
    expect(value.className).toContain('text-verde-rs');
  });

  it('sem highlight o valor usa a cor de texto padrão', () => {
    render(<StatCard label="Peças ativas" value="12" />);

    const value = screen.getByText('12');
    expect(value.className).toContain('text-tinta');
    expect(value.className).not.toContain('text-verde-rs');
  });

  it('não define largura fixa (quem decide o grid é a página)', () => {
    const { container } = render(<StatCard label="Peças ativas" value="12" />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).not.toMatch(/\bw-\d/);
  });

  describe('emphasized (painel do vendedor, frame ajustado do Figma)', () => {
    it('deixa o rótulo em caixa alta e negrito e o valor em negrito', () => {
      render(<StatCard label="Faturamento bruto no mês" value="R$ 200,00" emphasized />);

      expect(screen.getByText('Faturamento bruto no mês').className).toContain('uppercase');
      expect(screen.getByText('Faturamento bruto no mês').className).toContain('font-bold');
      expect(screen.getByText('R$ 200,00').className).toContain('font-bold');
    });

    it('sem emphasized o cartão continua como era (PriceBreakdown não muda)', () => {
      render(<StatCard label="Você recebe" value="R$ 91,00" />);

      expect(screen.getByText('Você recebe').className).not.toContain('uppercase');
      expect(screen.getByText('R$ 91,00').className).not.toContain('font-bold');
    });

    it('continua aceitando highlight e hint', () => {
      render(
        <StatCard
          label="Faturamento"
          value="R$ 200,00"
          hint="2 peças vendidas no mês"
          highlight
          emphasized
        />,
      );

      expect(screen.getByText('R$ 200,00').className).toContain('text-verde-rs');
      expect(screen.getByText('2 peças vendidas no mês')).toBeInTheDocument();
    });
  });
});
