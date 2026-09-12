import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProductGrid } from './ProductGrid';
import type { ProductDetail } from '@/types/product';

afterEach(cleanup);

const products: ProductDetail[] = [
  {
    id: 'prod-1',
    name: 'Vestido floral',
    category: 'vestidos',
    store: { id: 'store-1', name: 'Brechó Ana', city: 'Porto Alegre' },
    price: 89.9,
    coverImageUrl: 'https://example.com/vestido.jpg',
    condition: 'excelente',
    size: 'M',
    color: 'floral',
    brand: 'sem marca',
    description: 'Vestido floral em ótimo estado.',
    status: 'ativo',
    media: [],
  },
  {
    id: 'prod-2',
    name: 'Jaqueta jeans',
    category: 'jaquetas',
    store: { id: 'store-2', name: 'Brechó Bia', city: 'Canoas' },
    price: 120,
    coverImageUrl: null,
    condition: 'bom',
    size: 'G',
    color: 'azul',
    brand: 'sem marca',
    description: 'Jaqueta jeans clássica.',
    status: 'ativo',
    media: [],
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
