import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CartBadge from './CartBadge';

describe('CartBadge', () => {
  it('dispara onClick ao clicar', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<CartBadge count={0} onClick={onClick} />);

    await user.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('count = 0 esconde a bolha do contador', () => {
    render(<CartBadge count={0} onClick={vi.fn()} />);

    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('count > 0 mostra a bolha com o numero', () => {
    render(<CartBadge count={3} onClick={vi.fn()} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('count > 99 mostra "99+"', () => {
    render(<CartBadge count={150} onClick={vi.fn()} />);

    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('aria-label padrao inclui a contagem', () => {
    render(<CartBadge count={3} onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Carrinho, 3 itens' })).toBeInTheDocument();
  });

  it('aceita um ariaLabel customizado', () => {
    render(<CartBadge count={3} onClick={vi.fn()} ariaLabel="Meu carrinho" />);

    expect(screen.getByRole('button', { name: 'Meu carrinho' })).toBeInTheDocument();
  });
});
