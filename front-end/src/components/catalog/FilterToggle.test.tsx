import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterToggle from './FilterToggle';

afterEach(cleanup);

describe('<FilterToggle />', () => {
  it('calls onClick when the button is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<FilterToggle onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: /mais filtros/i }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('matches the other filter chips in height and colors', () => {
    render(<FilterToggle onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Mais filtros' })).toHaveClass(
      'min-h-touch',
      'border-linha',
      'bg-branco-quente',
    );
  });

  it('rotates the chevron (rotate-180) only when open is true', () => {
    const { container, rerender } = render(<FilterToggle onClick={vi.fn()} open />);

    expect(container.querySelector('img.transition-transform')).toHaveClass('rotate-180');

    rerender(<FilterToggle onClick={vi.fn()} open={false} />);
    expect(container.querySelector('img.transition-transform')).not.toHaveClass('rotate-180');
  });

  it('announces active filter counts without changing the visual pill', () => {
    const { rerender } = render(<FilterToggle onClick={vi.fn()} count={3} />);
    expect(
      screen.getByRole('button', { name: 'Mais filtros, 3 filtros ativos' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('3')).toBeNull();

    rerender(<FilterToggle onClick={vi.fn()} count={0} />);
    expect(screen.getByRole('button', { name: 'Mais filtros' })).toBeInTheDocument();

    rerender(<FilterToggle onClick={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Mais filtros' })).toBeInTheDocument();
  });
});
