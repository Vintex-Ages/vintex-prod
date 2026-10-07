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

    const badge = screen.getByText(label);

    expect(badge).toHaveTextContent(label);
    expect(badge).toHaveClass(colorClass);
  });

  it('permite sobrescrever o rótulo padrão', () => {
    render(<StatusBadge status="despublicado" label="Anúncio pausado" />);

    expect(screen.getByText('Anúncio pausado')).toBeInTheDocument();
  });

  it('renderiza o tamanho sm', () => {
    render(<StatusBadge status="ativo" size="sm" />);

    expect(screen.getByText('Anunciada')).toHaveClass('px-2', 'py-0.5');
  });

  it('não é região live: o selo é rótulo, não aviso', () => {
    render(<StatusBadge status="ativo" />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renderiza o tamanho md por padrão', () => {
    render(<StatusBadge status="ativo" />);

    expect(screen.getByText('Anunciada')).toHaveClass('px-3', 'py-1');
  });
});
