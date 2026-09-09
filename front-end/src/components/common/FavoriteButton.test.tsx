import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FavoriteButton } from './FavoriteButton';

describe('FavoriteButton', () => {
  it('chama onToggle ao clicar', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(<FavoriteButton active={false} onToggle={onToggle} />);

    await user.click(screen.getByRole('button', { name: 'Adicionar aos favoritos' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('reflete o estado ativo visualmente', () => {
    const onToggle = vi.fn();

    const { rerender } = render(<FavoriteButton active={false} onToggle={onToggle} />);

    const button = screen.getByRole('button', {
      name: 'Adicionar aos favoritos',
    });

    expect(button.querySelector('path')).toHaveAttribute('fill', 'none');

    rerender(<FavoriteButton active onToggle={onToggle} />);

    const activeButton = screen.getByRole('button', {
      name: 'Remover dos favoritos',
    });

    expect(activeButton).toHaveAttribute('aria-pressed', 'true');
    expect(activeButton.querySelector('path')).toHaveAttribute('fill', 'currentColor');
  });
});
