import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FilterPanel from './FilterPanel';

describe('FilterPanel', () => {
  // Garante que a alteração de categoria seja enviada ao componente pai.
  it('atualiza os filtros ao selecionar uma categoria', () => {
    const onChange = vi.fn();

    render(<FilterPanel filters={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Roupas' }));

    expect(onChange).toHaveBeenCalledWith({
      category: 'roupas',
    });
  });

  // Garante que os filtros adicionais também emitam alterações imediatamente.
  it('atualiza os filtros ao alterar a localização', () => {
    const onChange = vi.fn();

    render(<FilterPanel filters={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));
    fireEvent.change(screen.getByLabelText('Cidade'), {
      target: { value: 'Porto Alegre' },
    });

    expect(onChange).toHaveBeenCalledWith({
      city: 'Porto Alegre',
    });
  });

  // Garante o uso do Checkbox nos filtros com múltiplas opções.
  it('atualiza filtros de múltipla seleção', () => {
    const onChange = vi.fn();

    render(<FilterPanel filters={{}} onChange={onChange} sizeOptions={['M', 'G']} />);

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'M' }));

    expect(onChange).toHaveBeenCalledWith({
      size: ['M'],
    });
  });
});
