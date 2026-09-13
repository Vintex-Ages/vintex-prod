import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AuthHeader from './AuthHeader';

describe('AuthHeader', () => {
  it('mostra a marca "Vintex"', () => {
    render(<AuthHeader onBack={() => {}} />);

    expect(screen.getByText('Vintex')).toBeInTheDocument();
  });

  it('mostra um botao de voltar acessivel', () => {
    render(<AuthHeader onBack={() => {}} />);

    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
  });

  it('chama onBack ao clicar no botao de voltar', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<AuthHeader onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
