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
});
