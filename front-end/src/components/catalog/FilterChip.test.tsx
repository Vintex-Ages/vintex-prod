import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterChip } from './FilterChip';

describe('FilterChip', () => {
  it('renderiza o label', () => {
    render(<FilterChip label="Roupas" />);
    expect(screen.getByText('Roupas')).toBeInTheDocument();
  });

  it('dispara onToggle ao clicar no chip', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    render(<FilterChip label="Roupas" onToggle={onToggle} />);
    await user.click(screen.getByRole('button', { name: 'Roupas' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reflete o estado active via aria-pressed', () => {
    const { rerender } = render(<FilterChip label="Roupas" active={false} />);
    expect(screen.getByRole('button', { name: 'Roupas' })).toHaveAttribute('aria-pressed', 'false');

    rerender(<FilterChip label="Roupas" active={true} />);
    expect(screen.getByRole('button', { name: 'Roupas' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('não mostra botão de remover quando removable é false', () => {
    render(<FilterChip label="Roupas" />);
    expect(screen.queryByRole('button', { name: 'Remover Roupas' })).not.toBeInTheDocument();
  });

  it('mostra botão de remover e dispara onRemove quando removable', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();

    render(<FilterChip label="Roupas" removable onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: 'Remover Roupas' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('clicar em remover não dispara onToggle', async () => {
    const onToggle = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();

    render(<FilterChip label="Roupas" removable onToggle={onToggle} onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: 'Remover Roupas' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
