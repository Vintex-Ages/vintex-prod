import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['anunciada', 'Anunciada', 'border-linha'],
    ['vendida', 'Já vendida', 'border-verde-rs'],
    ['pausada', 'Pausada', 'border-dourado'],
  ] as const)('renderiza o status %s com rótulo e cor esperados', (status, label, colorClass) => {
    render(<StatusBadge status={status} />);

    const badge = screen.getByRole('status');

    expect(badge).toHaveTextContent(label);
    expect(badge).toHaveClass(colorClass);
  });

  it('permite sobrescrever o rótulo padrão', () => {
    render(<StatusBadge status="pausada" label="Anúncio pausado" />);

    expect(screen.getByRole('status')).toHaveTextContent('Anúncio pausado');
  });

  it('renderiza o tamanho sm', () => {
    render(<StatusBadge status="anunciada" size="sm" />);

    expect(screen.getByRole('status')).toHaveClass('px-2', 'py-0.5');
  });

  it('renderiza o tamanho md por padrão', () => {
    render(<StatusBadge status="anunciada" />);

    expect(screen.getByRole('status')).toHaveClass('px-3', 'py-1');
  });
});
