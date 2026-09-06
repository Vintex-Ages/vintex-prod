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
  it.each(['primary', 'secondary', 'quiet', 'success'] as const)(
    'renders the "%s" variant with the label',
    (variant) => {
      renderButton({ variant });

      expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    },
  );

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
