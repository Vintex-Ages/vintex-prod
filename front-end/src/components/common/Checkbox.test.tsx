import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Checkbox from './Checkbox';

afterEach(cleanup);

describe('<Checkbox />', () => {
  // Objetivo: garantir o toggle e o onChange.
  it('alterna o estado ao clicar', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Checkbox id="terms" checked={false} onChange={handleChange} />);

    await user.click(screen.getByRole('checkbox'));

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('alterna para desmarcado quando já está marcado', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Checkbox id="terms" checked={true} onChange={handleChange} />);

    await user.click(screen.getByRole('checkbox'));

    expect(handleChange).toHaveBeenCalledWith(false);
  });

  // Objetivo: garantir que não dispara onChange quando desabilitado.
  it('não dispara onChange quando disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<Checkbox id="terms" checked={false} onChange={handleChange} disabled />);

    await user.click(screen.getByRole('checkbox'));

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('reflete o estado marcado/desmarcado via prop checked (controlado)', () => {
    const { rerender } = render(
      <Checkbox id="terms" checked={false} onChange={() => {}} />,
    );
    expect(screen.getByRole('checkbox')).not.toBeChecked();

    rerender(<Checkbox id="terms" checked={true} onChange={() => {}} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('aplica o atributo disabled ao input', () => {
    render(<Checkbox id="terms" checked={false} onChange={() => {}} disabled />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('associa o rótulo ao input e permite alternar clicando nele', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <Checkbox id="terms" checked={false} onChange={handleChange} label="Aceito os termos" />,
    );

    const input = screen.getByLabelText('Aceito os termos');
    expect(input).toBe(screen.getByRole('checkbox'));

    await user.click(screen.getByText('Aceito os termos'));

    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('renderiza sem rótulo quando label não é informado', () => {
    render(<Checkbox id="terms" checked={false} onChange={() => {}} />);
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.queryByText(/./, { selector: 'label' })).toBeNull();
  });
});
