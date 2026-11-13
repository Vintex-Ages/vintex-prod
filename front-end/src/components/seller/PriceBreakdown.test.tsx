import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import PriceBreakdown from './PriceBreakdown';

afterEach(cleanup);

describe('<PriceBreakdown />', () => {
  it('mostra preço, comissão de 9% e valor líquido (RN-11)', () => {
    render(<PriceBreakdown price={100} />);

    expect(screen.getByText('R$ 100,00')).toBeTruthy();
    expect(screen.getByText(/comissão da plataforma \(9%\)/i)).toBeTruthy();
    expect(screen.getByText('R$ 9,00')).toBeTruthy();
    expect(screen.getByText('R$ 91,00')).toBeTruthy();
  });

  it('price = null renderiza placeholder sem erro e sem NaN', () => {
    const { container } = render(<PriceBreakdown price={null} />);

    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(container.textContent).not.toContain('NaN');
  });

  it('respeita commissionRate customizada', () => {
    render(<PriceBreakdown price={200} commissionRate={0.1} />);

    expect(screen.getByText(/comissão da plataforma \(10%\)/i)).toBeTruthy();
    expect(screen.getByText('R$ 20,00')).toBeTruthy();
    expect(screen.getByText('R$ 180,00')).toBeTruthy();
  });

  it('"você recebe" fica em destaque na cor de confiança', () => {
    render(<PriceBreakdown price={100} />);

    expect(screen.getByText('R$ 91,00').className).toContain('text-verde-rs');
  });

  it('variant="inline" (padrão) é uma linha só, sem fundo de cartão', () => {
    const { container } = render(<PriceBreakdown price={100} variant="inline" />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain('flex-wrap');
    expect(root.className).not.toContain('bg-papel-profundo');
    expect(screen.getByText('Preço')).toBeTruthy();
    expect(screen.getByText('Você recebe')).toBeTruthy();
  });

  it('sem variant usa inline', () => {
    const { container } = render(<PriceBreakdown price={100} />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).not.toContain('bg-papel-profundo');
  });

  it('variant="card" mostra a comissão com sinal de desconto e o líquido no Pix (frame T14)', () => {
    const { container } = render(<PriceBreakdown price={100} variant="card" />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain('bg-branco-quente');
    expect(root.className).toContain('border-linha');
    // O preço já aparece acima, no campo da revisão: o cartão só traz comissão e líquido.
    expect(root.children).toHaveLength(2);
    expect(screen.queryByText('Preço')).toBeNull();
    expect(screen.getByText('Comissão Vintex (9%):')).toBeTruthy();
    expect(screen.getByText('- R$ 9,00')).toBeTruthy();
    expect(screen.getByText('Você recebe líquido no Pix:')).toBeTruthy();
    expect(screen.getByText('R$ 91,00').className).toContain('text-verde-rs');
  });

  it('variant="card" sem preço mostra placeholder, sem NaN', () => {
    const { container } = render(<PriceBreakdown price={null} variant="card" />);

    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(container.textContent).not.toContain('NaN');
  });
});
