import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StyleOption } from '@/types/preference';
import StyleSelector from './StyleSelector';

const styles: StyleOption[] = [
  {
    type: 'estilo',
    value: 'casual',
    label: 'Casual',
    description: 'Peças confortáveis para o dia a dia',
  },
  {
    type: 'estilo',
    value: 'vintage',
    label: 'Vintage',
    description: 'Achados marcantes de outras épocas',
  },
  {
    type: 'estilo',
    value: 'streetwear',
    label: 'Streetwear',
    description: 'Moda urbana e contemporânea',
  },
];

describe('<StyleSelector />', () => {
  it('renderiza o nome e a descrição de cada estilo', () => {
    render(<StyleSelector styles={styles} selectedValues={[]} onChange={() => {}} />);

    for (const style of styles) {
      expect(screen.getByText(style.label)).toBeInTheDocument();
      expect(screen.getByText(style.description!)).toBeInTheDocument();
    }
  });

  it('exibe como selecionados os estilos presentes em selectedValues', () => {
    render(
      <StyleSelector
        styles={styles}
        selectedValues={['casual', 'streetwear']}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole('checkbox', { name: /casual/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /vintage/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /streetwear/i })).toBeChecked();
  });

  it('seleciona um estilo e informa a lista completa atualizada', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StyleSelector styles={styles} selectedValues={['vintage']} onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: /casual/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['vintage', 'casual']);
  });

  it('desmarca um estilo sem remover as outras seleções', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StyleSelector
        styles={styles}
        selectedValues={['casual', 'vintage', 'streetwear']}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /vintage/i }));

    expect(onChange).toHaveBeenCalledWith(['casual', 'streetwear']);
  });

  it('permite desmarcar o último estilo e informa uma lista vazia', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StyleSelector styles={styles} selectedValues={['casual']} onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: /casual/i }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('oferece um checkbox com nome acessível para cada estilo', () => {
    render(<StyleSelector styles={styles} selectedValues={[]} onChange={() => {}} />);

    expect(screen.getByRole('checkbox', { name: /casual/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /vintage/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /streetwear/i })).toBeInTheDocument();
  });

  it('permite alcançar e selecionar uma opção com Tab e Space', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StyleSelector styles={styles} selectedValues={[]} onChange={onChange} />);

    await user.tab();
    expect(screen.getByRole('checkbox', { name: /casual/i })).toHaveFocus();

    await user.keyboard('[Space]');

    expect(onChange).toHaveBeenCalledWith(['casual']);
  });

  it('desabilita as opções e impede alterações quando disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StyleSelector styles={styles} selectedValues={['vintage']} onChange={onChange} disabled />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((checkbox) => expect(checkbox).toBeDisabled());

    await user.click(screen.getByRole('checkbox', { name: /casual/i }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
