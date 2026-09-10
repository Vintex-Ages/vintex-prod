import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProductGrid } from './ProductGrid';
import type { Product } from './ProductCard';

afterEach(cleanup);

const products: Product[] = [
  {
    id: 'prod-1',
    title: 'Vestido floral',
    category: 'vestidos',
    storeName: 'Brechó Ana',
    city: 'Porto Alegre',
    price: 89.9,
    coverImageUrl: 'https://example.com/vestido.jpg',
    condition: 'excelente',
  },
  {
    id: 'prod-2',
    title: 'Jaqueta jeans',
    category: 'jaquetas',
    storeName: 'Brechó Bia',
    city: 'Canoas',
    price: 120,
    coverImageUrl: null,
    condition: 'bom',
  },
];

const renderGrid = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('<ProductGrid />', () => {
  // Objetivo: garantir que a grade renderiza os produtos e usa 2 colunas no mobile.
  it('renderiza os produtos em uma grade com 2 colunas no mobile', () => {
    const { container } = renderGrid(<ProductGrid products={products} onOpen={() => {}} />);

    expect(screen.getByText('Vestido floral')).toBeInTheDocument();
    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();

    const grid = container.firstElementChild;
    expect(grid).toHaveClass('grid-cols-2');
  });

  // Objetivo: garantir que uma lista sem produtos exibe o estado vazio.
  it('mostra o EmptyState quando a lista está vazia', () => {
    renderGrid(<ProductGrid products={[]} onOpen={() => {}} />);

    expect(screen.getByText('Nenhuma peça encontrada')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma peça encontrada no momento.')).toBeInTheDocument();
  });

  // Objetivo: garantir que o estado de carregamento renderiza os skeletons.
  it('renderiza skeletons enquanto o catálogo está carregando', () => {
    const { container } = renderGrid(
      <ProductGrid products={[]} loading skeletonCount={3} onOpen={() => {}} />,
    );

    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });
});
