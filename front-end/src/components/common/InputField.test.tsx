import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InputField from './InputField';
import type { InputFieldProps } from './InputField';

afterEach(cleanup);

function renderField(props: Partial<InputFieldProps> = {}) {
  return render(<InputField id="campo" label="Campo" value="" onChange={() => {}} {...props} />);
}

describe('<InputField />', () => {
  it('renders label, input and helper text in both variants', () => {
    // With Helper
    renderField({ placeholder: 'Digite aqui', helperText: 'Texto de ajuda' });
    expect(screen.getByLabelText('Campo')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Digite aqui')).toBeInTheDocument();
    expect(screen.getByText('Texto de ajuda')).toBeInTheDocument();

    cleanup();

    // Default — sem ajuda, nenhuma mensagem é renderizada
    renderField();
    expect(screen.getByLabelText('Campo')).toBeInTheDocument();
    expect(screen.queryByText('Texto de ajuda')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Campo')).not.toHaveAttribute('aria-describedby');
  });

  it('shows the error message in place of the helper text', () => {
    renderField({ helperText: 'Texto de ajuda', error: 'Campo obrigatório' });

    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
    expect(screen.queryByText('Texto de ajuda')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Campo')).toHaveAttribute('aria-invalid', 'true');
  });

  it('associates the label with the input through htmlFor/id', () => {
    renderField();

    const input = screen.getByLabelText('Campo');
    expect(input).toHaveAttribute('id', 'campo');
    expect(input.tagName).toBe('INPUT');
  });

  it('calls onChange with the value, not the event', async () => {
    const onChange = vi.fn();
    renderField({ onChange });

    await userEvent.type(screen.getByLabelText('Campo'), 'a');

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('renders a disabled input when disabled', () => {
    renderField({ disabled: true });

    expect(screen.getByLabelText('Campo')).toBeDisabled();
  });
});
