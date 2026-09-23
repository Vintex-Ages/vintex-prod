import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TextArea from './TextArea';
import type { TextAreaProps } from './TextArea';

afterEach(cleanup);

function renderField(props: Partial<TextAreaProps> = {}) {
  return render(<TextArea id="campo" label="Campo" value="" onChange={() => {}} {...props} />);
}

describe('<TextArea />', () => {
  it('renderiza label, textarea e texto de ajuda associados', () => {
    renderField({ helperText: 'Texto de ajuda' });

    const field = screen.getByRole('textbox', { name: 'Campo' });
    const label = screen.getByText('Campo');
    const help = screen.getByText('Texto de ajuda');

    expect(field.tagName).toBe('TEXTAREA');
    expect(label).toHaveAttribute('for', 'campo');
    expect(field).toHaveAttribute('id', 'campo');
    expect(field).toHaveAttribute('aria-describedby', help.id);
    expect(help).toHaveClass('text-texto-auxiliar');
  });

  it('emite somente o novo valor no onChange', async () => {
    const onChange = vi.fn();
    renderField({ onChange });

    await userEvent.type(screen.getByRole('textbox', { name: 'Campo' }), 'a');

    expect(onChange.mock.calls).toEqual([['a']]);
  });

  it('usa quatro linhas por padrão e pode receber outro número', () => {
    const { rerender } = renderField();
    const field = screen.getByRole('textbox', { name: 'Campo' });

    expect(field).toHaveAttribute('rows', '4');
    expect(field).toHaveClass('resize-y');

    rerender(<TextArea id="campo" label="Campo" value="" onChange={() => {}} rows={7} />);
    expect(field).toHaveAttribute('rows', '7');
  });

  it('repassa o placeholder', () => {
    renderField({ placeholder: 'Descreva a peça' });

    expect(screen.getByRole('textbox', { name: 'Campo' })).toHaveAttribute(
      'placeholder',
      'Descreva a peça',
    );
  });

  it('mostra o contador com maxLength e acompanha o valor recebido', () => {
    const { rerender } = renderField({ value: 'abc', maxLength: 5 });
    const field = screen.getByRole('textbox', { name: 'Campo' });

    expect(field).toHaveAttribute('maxLength', '5');
    expect(screen.getByText('3/5')).toHaveClass('text-texto-auxiliar');
    expect(field).toHaveAttribute('aria-describedby', 'campo-counter');

    rerender(<TextArea id="campo" label="Campo" value="abcd" onChange={() => {}} maxLength={5} />);
    expect(screen.getByText('4/5')).toBeInTheDocument();
    expect(screen.queryByText('3/5')).not.toBeInTheDocument();
  });

  it('não permite digitar além do maxLength nativo', async () => {
    function ControlledField() {
      const [value, setValue] = useState('');
      return <TextArea id="campo" label="Campo" value={value} onChange={setValue} maxLength={3} />;
    }

    render(<ControlledField />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Campo' }), 'abcd');

    expect(screen.getByRole('textbox', { name: 'Campo' })).toHaveValue('abc');
    expect(screen.getByText('3/3')).toBeInTheDocument();
  });

  it('substitui a ajuda pelo erro e associa erro e contador ao textarea', () => {
    renderField({ helperText: 'Texto de ajuda', error: 'Campo obrigatório', maxLength: 10 });

    const field = screen.getByRole('textbox', { name: 'Campo' });
    const alert = screen.getByRole('alert');

    expect(alert).toHaveTextContent('Campo obrigatório');
    expect(alert).toHaveClass('text-vermelho-escuro');
    expect(screen.queryByText('Texto de ajuda')).not.toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', 'campo-message campo-counter');
    expect(field).toHaveClass(
      'border-vermelho-escuro',
      'focus:border-vermelho-escuro',
      'focus:ring-vermelho-escuro',
    );
  });

  it('usa os tokens e o foco de campo de texto quando não há erro', () => {
    renderField();

    expect(screen.getByRole('textbox', { name: 'Campo' })).toHaveClass(
      'bg-branco-quente',
      'border-linha',
      'text-tinta',
      'focus:border-tinta',
      'focus:ring-tinta',
    );
  });

  it('desabilita o textarea com o visual do InputField', () => {
    renderField({ disabled: true });

    expect(screen.getByRole('textbox', { name: 'Campo' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Campo' })).toHaveClass(
      'cursor-not-allowed',
      'bg-papel-profundo',
      'text-texto-auxiliar',
    );
  });

  it('renderiza o adornamento ao lado do label', () => {
    renderField({ labelAdornment: <span>Opcional</span> });

    expect(screen.getByText('Opcional')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Campo' })).toBeInTheDocument();
  });
});
