import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FilterPanel from './FilterPanel';

describe('FilterPanel', () => {
  // Garante que a alteração de categoria seja enviada ao componente pai.
  it('atualiza os filtros ao selecionar uma categoria', () => {
    const onChange = vi.fn();

    render(<FilterPanel filters={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Roupas' }));

    // O valor tem que ser o gravado no dado, não o rótulo em minúsculo: a
    // comparação de categoria é por igualdade no mock e no backend.
    expect(onChange).toHaveBeenCalledWith({
      category: 'Roupas',
    });
  });

  // FE-US009-5 (#336): cidade e estado são escolha única, com as opções que
  // existem nas lojas (a página passa `locationOptions`).
  const LOCATIONS = [
    { city: 'Canoas', state: 'RS' },
    { city: 'Porto Alegre', state: 'RS' },
    { city: 'Florianópolis', state: 'SC' },
  ];

  it('escolher um estado filtra pelo estado', () => {
    const onChange = vi.fn();

    render(<FilterPanel filters={{}} onChange={onChange} locationOptions={LOCATIONS} />);

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), {
      target: { value: 'SC' },
    });

    expect(onChange).toHaveBeenCalledWith({ state: 'SC' });
  });

  it('escolher uma cidade filtra pela cidade e pelo estado dela', () => {
    const onChange = vi.fn();

    render(<FilterPanel filters={{}} onChange={onChange} locationOptions={LOCATIONS} />);

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Cidade' }), {
      target: { value: 'Canoas' },
    });

    expect(onChange).toHaveBeenCalledWith({ city: 'Canoas', state: 'RS' });
  });

  it('com um estado escolhido, a cidade só oferece as daquele estado', () => {
    render(
      <FilterPanel filters={{ state: 'SC' }} onChange={vi.fn()} locationOptions={LOCATIONS} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));
    const cidades = within(screen.getByRole('combobox', { name: 'Cidade' }))
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(cidades).toEqual(['Todas as cidades', 'Florianópolis']);
  });

  it('trocar o estado tira a cidade que não é dele', () => {
    const onChange = vi.fn();

    render(
      <FilterPanel
        filters={{ city: 'Canoas', state: 'RS' }}
        onChange={onChange}
        locationOptions={LOCATIONS}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), {
      target: { value: 'SC' },
    });

    expect(onChange).toHaveBeenCalledWith({ state: 'SC', city: undefined });
  });

  it('"Todas as cidades" remove só o filtro de cidade', () => {
    const onChange = vi.fn();

    render(
      <FilterPanel
        filters={{ city: 'Canoas', state: 'RS' }}
        onChange={onChange}
        locationOptions={LOCATIONS}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Cidade' }), {
      target: { value: '' },
    });

    expect(onChange).toHaveBeenCalledWith({ state: 'RS', city: undefined });
  });

  it('cidade vinda da URL que não está nas opções continua visível e removível', () => {
    render(
      <FilterPanel filters={{ city: 'Gramado' }} onChange={vi.fn()} locationOptions={LOCATIONS} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));

    expect(screen.getByRole('combobox', { name: 'Cidade' })).toHaveValue('Gramado');
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

  it('fecha o painel ao clicar fora dele (no fundo escurecido)', () => {
    const onChange = vi.fn();

    render(<FilterPanel filters={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));
    expect(screen.getByText('Faixa de preço')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('drawer-backdrop'));
    expect(screen.queryByText('Faixa de preço')).not.toBeInTheDocument();
  });

  it('não fecha o painel ao clicar dentro dele', () => {
    const onChange = vi.fn();

    render(<FilterPanel filters={{}} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));
    fireEvent.click(screen.getByText('Faixa de preço'));

    expect(screen.getByText('Faixa de preço')).toBeInTheDocument();
  });
  it('fecha o painel com a tecla Escape', () => {
    render(<FilterPanel filters={{}} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));
    expect(screen.getByText('Faixa de preço')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Faixa de preço')).not.toBeInTheDocument();
  });

  it('fecha o painel pelo botão dentro do drawer', () => {
    render(<FilterPanel filters={{}} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /mais filtros/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar filtros' }));

    expect(screen.queryByText('Faixa de preço')).not.toBeInTheDocument();
  });
});
