import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ActiveFilters from './ActiveFilters';
import type { CatalogFilters } from '@/types/catalog';

describe('ActiveFilters', () => {
  it('mostra a contagem de resultados mesmo sem filtro ativo', () => {
    render(<ActiveFilters filters={{}} onChange={() => {}} total={12} />);

    expect(screen.getByText('12 peças encontradas')).toBeInTheDocument();
  });

  it('renderiza um chip por categoria ativa', () => {
    const filters: CatalogFilters = { category: 'Roupas' };
    render(<ActiveFilters filters={filters} onChange={() => {}} total={3} />);

    expect(screen.getByText('Roupas')).toBeInTheDocument();
  });

  it('renderiza um chip por valor em campos de múltipla escolha', () => {
    const filters: CatalogFilters = { size: ['M', 'G'] };
    render(<ActiveFilters filters={filters} onChange={() => {}} total={5} />);

    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('remove só o valor clicado, mantendo os outros do mesmo campo', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const filters: CatalogFilters = { size: ['M', 'G'] };

    render(<ActiveFilters filters={filters} onChange={onChange} total={5} />);

    await user.click(screen.getByRole('button', { name: 'Remover M' }));

    expect(onChange).toHaveBeenCalledWith({ size: ['G'] });
  });

  it('remove minPrice e maxPrice juntos ao clicar no chip de preço', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const filters: CatalogFilters = { minPrice: 0, maxPrice: 200, category: 'Roupas' };

    render(<ActiveFilters filters={filters} onChange={onChange} total={5} />);

    await user.click(screen.getByRole('button', { name: 'Remover R$ 0 - R$ 200' }));

    expect(onChange).toHaveBeenCalledWith({
      category: 'Roupas',
      minPrice: undefined,
      maxPrice: undefined,
    });
  });
  it('mostra o rótulo da tela para o valor gravado no dado', () => {
    // "Calçados" é o rótulo; o dado (mock e seed) grava "Sapatos". É o único
    // mapeamento em que os dois não coincidem.
    render(<ActiveFilters filters={{ category: 'Sapatos' }} onChange={vi.fn()} total={2} />);

    expect(screen.getByText('Calçados')).toBeInTheDocument();
  });
});
