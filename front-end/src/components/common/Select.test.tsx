import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Select from './Select';
import type { SelectOption, SelectProps } from './Select';

afterEach(cleanup);

const options: SelectOption[] = [
  { value: 'p', label: 'Pequeno' },
  { value: 'm', label: 'Médio', disabled: true },
  { value: 'g', label: 'Grande' },
];

function renderSelect(props: Partial<SelectProps> = {}) {
  return render(
    <Select
      id="tamanho"
      label="Tamanho"
      value={null}
      onChange={() => {}}
      options={options}
      {...props}
    />,
  );
}

describe('<Select />', () => {
  it('renderiza label, select e ajuda associados por htmlFor/id e aria-describedby', () => {
    renderSelect({ helperText: 'Escolha um tamanho' });

    const select = screen.getByRole('combobox', { name: 'Tamanho' });
    const label = screen.getByText('Tamanho', { selector: 'label' });
    const helper = screen.getByText('Escolha um tamanho');

    expect(select.tagName).toBe('SELECT');
    expect(label).toHaveAttribute('for', 'tamanho');
    expect(select).toHaveAttribute('id', 'tamanho');
    expect(helper).toHaveAttribute('id', 'tamanho-message');
    expect(select).toHaveAttribute('aria-describedby', helper.id);
    expect(helper).toHaveClass('text-texto-auxiliar');
  });

  it('renderiza todas as opções na ordem recebida e respeita disabled', () => {
    renderSelect();

    const renderedOptions = screen.getAllByRole('option');
    expect(renderedOptions.map((option) => option.textContent)).toEqual([
      '',
      'Pequeno',
      'Médio',
      'Grande',
    ]);
    expect(renderedOptions.map((option) => option.getAttribute('value'))).toEqual([
      '',
      'p',
      'm',
      'g',
    ]);
    expect(renderedOptions[2]).toBeDisabled();
    expect(renderedOptions[1]).not.toBeDisabled();
  });

  it('emite somente o valor selecionado, sem passar o evento', async () => {
    const onChange = vi.fn();
    renderSelect({ onChange });

    await userEvent.selectOptions(screen.getByRole('combobox'), 'g');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]).toEqual(['g']);
  });

  it('emite null ao selecionar a opção vazia', async () => {
    const onChange = vi.fn();
    renderSelect({ value: 'p', placeholder: 'Selecione um tamanho', onChange });

    await userEvent.selectOptions(screen.getByRole('combobox'), '');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]).toEqual([null]);
  });

  it('usa o placeholder como opção vazia habilitada e selecionada quando value é null', () => {
    renderSelect({ placeholder: 'Selecione um tamanho' });

    const select = screen.getByRole('combobox');
    const emptyOption = screen.getByRole('option', { name: 'Selecione um tamanho' });

    expect(emptyOption).toHaveAttribute('value', '');
    expect(emptyOption).not.toBeDisabled();
    expect(select).toHaveValue('');
  });

  it('representa value null com uma opção vazia mesmo sem placeholder', () => {
    renderSelect();

    const emptyOption = screen.getAllByRole('option')[0];
    expect(emptyOption).toHaveAttribute('value', '');
    expect(emptyOption).toBeEmptyDOMElement();
    expect(emptyOption).not.toBeDisabled();
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('substitui a ajuda por erro com role alert e associa a mensagem ao select', () => {
    renderSelect({ helperText: 'Escolha um tamanho', error: 'Tamanho obrigatório' });

    const select = screen.getByRole('combobox');
    const alert = screen.getByRole('alert');

    expect(alert).toHaveTextContent('Tamanho obrigatório');
    expect(alert).toHaveAttribute('id', 'tamanho-message');
    expect(alert).toHaveClass('text-vermelho-escuro');
    expect(screen.queryByText('Escolha um tamanho')).not.toBeInTheDocument();
    expect(select).toHaveAttribute('aria-describedby', alert.id);
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveClass(
      'border-vermelho-escuro',
      'focus:border-vermelho-escuro',
      'focus:ring-vermelho-escuro',
    );
  });

  it('desabilita o select e aplica o padrão visual do InputField', () => {
    renderSelect({ disabled: true });

    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('combobox')).toHaveClass(
      'cursor-not-allowed',
      'bg-papel-profundo',
      'text-texto-auxiliar',
    );
  });

  it('mostra labelAdornment junto ao label', () => {
    renderSelect({ labelAdornment: <span>Opcional</span> });

    const label = screen.getByText('Tamanho', { selector: 'label' });
    const adornment = screen.getByText('Opcional');
    expect(label.parentElement).toContainElement(adornment);
  });

  it('usa os tokens e estados de foco principais do InputField', () => {
    renderSelect();

    expect(screen.getByRole('combobox')).toHaveClass(
      'border',
      'bg-branco-quente',
      'border-linha',
      'px-4',
      'py-3',
      'text-body',
      'text-tinta',
      'focus:outline-none',
      'focus:ring-1',
      'focus:border-tinta',
      'focus:ring-tinta',
    );
  });
});
