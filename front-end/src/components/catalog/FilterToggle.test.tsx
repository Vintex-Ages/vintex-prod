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

  it('shows the count badge only when count is greater than 0', () => {
    const { rerender } = render(<FilterToggle onClick={vi.fn()} count={3} />);
    expect(screen.getByText('3')).toBeTruthy();

    rerender(<FilterToggle onClick={vi.fn()} count={0} />);
    expect(screen.queryByText('0')).toBeNull();

    rerender(<FilterToggle onClick={vi.fn()} />);
    expect(screen.queryByText('0')).toBeNull();
  });
});
