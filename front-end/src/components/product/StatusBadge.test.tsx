import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['rascunho', 'Rascunho', 'bg-papel-profundo'],
    ['ativo', 'Anunciada', 'bg-branco-quente'],
    ['vendido', 'Já vendida', 'border-verde-rs'],
    ['despublicado', 'Pausada', 'border-dourado'],
  ] as const)('traduz o status %s para o rótulo e a cor esperados', (status, label, colorClass) => {
    render(<StatusBadge status={status} />);

    const badge = screen.getByRole('status');

    expect(badge).toHaveTextContent(label);
    expect(badge).toHaveClass(colorClass);
  });

  it('permite sobrescrever o rótulo padrão', () => {
    render(<StatusBadge status="despublicado" label="Anúncio pausado" />);

    expect(screen.getByRole('status')).toHaveTextContent('Anúncio pausado');
  });

  it('renderiza o tamanho sm', () => {
    render(<StatusBadge status="ativo" size="sm" />);

    expect(screen.getByRole('status')).toHaveClass('px-2', 'py-0.5');
  });

  it('renderiza o tamanho md por padrão', () => {
    render(<StatusBadge status="ativo" />);

    expect(screen.getByRole('status')).toHaveClass('px-3', 'py-1');
  });
});
