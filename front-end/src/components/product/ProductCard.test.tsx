import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProductCard, { type Product } from './ProductCard';

afterEach(cleanup);

const baseProduct: Product = {
  id: 'prod-1',
  title: 'Vestido floral',
  category: 'vestidos',
  storeName: 'Brechó Ana',
  city: 'Porto Alegre',
  price: 89.9,
  coverImageUrl: 'https://example.com/vestido.jpg',
  condition: 'excelente',
};

describe('<ProductCard />', () => {
  // Objetivo: garantir que os campos do produto aparecem no cartão.
  it('renderiza os campos do produto', () => {
    render(<ProductCard product={baseProduct} onOpen={() => {}} />);

    expect(screen.getByText('vestidos')).toBeTruthy();
    expect(screen.getByText('Vestido floral')).toBeTruthy();
    expect(screen.getByText('Brechó Ana · Porto Alegre')).toBeTruthy();
    expect(screen.getByText('excelente')).toBeTruthy();
    expect(screen.getByText(/R\$\s?89,90/)).toBeTruthy();

    const image = screen.getByAltText('Vestido floral');
    expect(image.tagName).toBe('IMG');
  });

  // Objetivo: sem coverImageUrl, mostra um placeholder e não quebra a renderização.
  it('usa um placeholder quando não há coverImageUrl', () => {
    const productWithoutImage: Product = { ...baseProduct, coverImageUrl: null };
    render(<ProductCard product={productWithoutImage} onOpen={() => {}} />);

    const placeholder = screen.getByRole('img', { name: 'Vestido floral' });
    expect(placeholder.tagName).not.toBe('IMG');
    expect(screen.getByText('Vestido floral')).toBeTruthy();
  });

  // Objetivo: garantir que o favoriteSlot recebido é renderizado dentro do cartão.
  it('renderiza o favoriteSlot quando fornecido', () => {
    render(
      <ProductCard
        product={baseProduct}
        onOpen={() => {}}
        favoriteSlot={<button aria-label="Favoritar">♥</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Favoritar' })).toBeTruthy();
  });

  // Objetivo: clicar no cartão (fora do favoriteSlot) dispara onOpen com o id correto.
  it('dispara onOpen com o id do produto ao clicar no cartão', async () => {
    const user = userEvent.setup();
    const handleOpen = vi.fn();
    render(<ProductCard product={baseProduct} onOpen={handleOpen} />);

    await user.click(screen.getByText('Vestido floral'));

    expect(handleOpen).toHaveBeenCalledTimes(1);
    expect(handleOpen).toHaveBeenCalledWith('prod-1');
  });

  // Objetivo: clicar no favoriteSlot não deve disparar onOpen do cartão.
  it('não dispara onOpen ao clicar no favoriteSlot', async () => {
    const user = userEvent.setup();
    const handleOpen = vi.fn();
    render(
      <ProductCard
        product={baseProduct}
        onOpen={handleOpen}
        favoriteSlot={<button aria-label="Favoritar">♥</button>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Favoritar' }));

    expect(handleOpen).not.toHaveBeenCalled();
  });

  // Objetivo: pressionar Enter com o cartão focado dispara onOpen, igual ao clique.
  it('dispara onOpen ao pressionar Enter no cartão', async () => {
    const user = userEvent.setup();
    const handleOpen = vi.fn();
    render(<ProductCard product={baseProduct} onOpen={handleOpen} />);

    screen.getByRole('button', { name: 'Vestido floral' }).focus();
    await user.keyboard('{Enter}');

    expect(handleOpen).toHaveBeenCalledTimes(1);
    expect(handleOpen).toHaveBeenCalledWith('prod-1');
  });

  // Objetivo: pressionar uma tecla dentro do favoriteSlot não deve disparar onOpen do
  // cartão (o keydown é interrompido antes de borbulhar até o card).
  it('não dispara onOpen ao pressionar uma tecla dentro do favoriteSlot', async () => {
    const user = userEvent.setup();
    const handleOpen = vi.fn();
    render(
      <ProductCard
        product={baseProduct}
        onOpen={handleOpen}
        favoriteSlot={<button aria-label="Favoritar">♥</button>}
      />,
    );

    screen.getByRole('button', { name: 'Favoritar' }).focus();
    await user.keyboard('{Enter}');

    expect(handleOpen).not.toHaveBeenCalled();
  });
});
