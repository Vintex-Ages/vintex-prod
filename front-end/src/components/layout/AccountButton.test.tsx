import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountButton } from './AccountButton';

describe('AccountButton', () => {
  it('chama onClick ao clicar', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<AccountButton label="Entrar" open={false} onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('reflete o estado open no indicador', () => {
    const onClick = vi.fn();

    const { rerender } = render(<AccountButton label="Entrar" open={false} onClick={onClick} />);

    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    rerender(<AccountButton label="Entrar" open onClick={onClick} />);

    expect(screen.getByRole('button', { name: 'Entrar' })).toHaveAttribute('aria-expanded', 'true');
  });
});
