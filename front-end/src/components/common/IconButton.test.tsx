import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IconButton from './IconButton';
import type { IconButtonProps } from './IconButton';

afterEach(cleanup);

function renderButton(props: Partial<IconButtonProps> = {}) {
  return render(
    <IconButton
      icon={<svg data-testid="icon" />}
      onClick={() => {}}
      ariaLabel="Voltar"
      {...props}
    />,
  );
}

describe('<IconButton />', () => {
  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    renderButton({ onClick });

    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has an accessible label, with no visible text', () => {
    renderButton({ ariaLabel: 'Fechar' });

    const button = screen.getByRole('button', { name: 'Fechar' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAccessibleName('Fechar');
    expect(button).not.toHaveTextContent(/\w/);
  });

  it('renders the icon passed as a prop', () => {
    renderButton();

    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('defaults to the "default" variant', () => {
    renderButton();

    expect(screen.getByRole('button')).toHaveClass('border-linha');
  });

  it('applies the "primary" variant styles', () => {
    renderButton({ variant: 'primary' });

    expect(screen.getByRole('button')).toHaveClass('bg-vermelho-escuro');
  });

  it('meets the minimum 44px touch target', () => {
    renderButton();

    const button = screen.getByRole('button');
    expect(button).toHaveClass('min-h-11');
    expect(button).toHaveClass('min-w-11');
  });

  it('disables the button and blocks onClick when disabled', async () => {
    const onClick = vi.fn();
    renderButton({ onClick, disabled: true });

    const button = screen.getByRole('button', { name: 'Voltar' });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
