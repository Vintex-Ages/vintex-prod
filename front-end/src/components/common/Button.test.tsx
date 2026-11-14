import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button';
import type { ButtonProps } from './Button';

afterEach(cleanup);

function renderButton(props: Partial<ButtonProps> = {}) {
  return render(
    <Button onClick={() => {}} {...props}>
      {props.children ?? 'Continuar'}
    </Button>,
  );
}

describe('<Button />', () => {
  it.each(['primary', 'secondary', 'quiet', 'success', 'outline'] as const)(
    'renders the "%s" variant with the label',
    (variant) => {
      renderButton({ variant });

      expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    },
  );

  it('applies different styles depending on the variant', () => {
    renderButton({ variant: 'primary' });
    const primaryClassName = screen.getByRole('button').className;

    cleanup();
    renderButton({ variant: 'outline' });
    const outlineClassName = screen.getByRole('button').className;

    expect(outlineClassName).not.toBe(primaryClassName);
  });

  it('forwards native button attributes not covered by ButtonProps', () => {
    renderButton({ 'aria-label': 'Fechar modal' });

    expect(screen.getByRole('button', { name: 'Fechar modal' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    renderButton({ onClick });

    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn();
    renderButton({ onClick, disabled: true });

    const button = screen.getByRole('button', { name: 'Continuar' });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
