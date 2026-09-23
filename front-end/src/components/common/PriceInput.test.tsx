import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PriceInput from './PriceInput';

describe('PriceInput', () => {
  it('digitação aplica a máscara e emite centavos', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<PriceInput id="preco" label="Preço" value={null} onChange={handleChange} />);

    const input = screen.getByLabelText('Preço');
    await user.type(input, '123456');

    // Cada dígito emite o valor acumulado em centavos.
    expect(handleChange).toHaveBeenLastCalledWith(123456);
    // O texto exibido já vem formatado como moeda.
    expect(input).toHaveValue('R$ 1.234,56');
  });

  it('campo vazio emite null', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<PriceInput id="preco" label="Preço" value={123456} onChange={handleChange} />);

    const input = screen.getByLabelText('Preço');
    await user.clear(input);

    expect(handleChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue('');
  });

  it('colar texto com letras é ignorado', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<PriceInput id="preco" label="Preço" value={null} onChange={handleChange} />);

    const input = screen.getByLabelText('Preço');
    await user.type(input, 'abc');

    expect(handleChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('error pinta a borda e mostra a mensagem', () => {
    render(
      <PriceInput
        id="preco"
        label="Preço"
        value={null}
        onChange={vi.fn()}
        error="Informe um preço válido"
      />,
    );

    const input = screen.getByLabelText('Preço');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.className).toContain('border-vermelho-escuro');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um preço válido');
  });

  it('usa inputMode decimal e associa o rótulo pelo id', () => {
    render(<PriceInput id="preco" label="Preço" value={null} onChange={vi.fn()} />);

    const input = screen.getByLabelText('Preço');
    expect(input).toHaveAttribute('inputMode', 'decimal');
    expect(input).toHaveAttribute('id', 'preco');
  });
});
