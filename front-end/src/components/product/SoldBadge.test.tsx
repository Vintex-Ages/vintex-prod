import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SoldBadge from './SoldBadge';

describe('SoldBadge', () => {
  it('mostra o aviso "Já vendida"', () => {
    render(<SoldBadge />);

    expect(screen.getByText('Já vendida')).toBeInTheDocument();
  });

  it('é anunciado como status para leitor de tela', () => {
    render(<SoldBadge />);

    expect(screen.getByRole('status')).toHaveTextContent('Já vendida');
  });
});
