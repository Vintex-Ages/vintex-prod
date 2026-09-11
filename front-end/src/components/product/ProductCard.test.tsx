import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type { ProductDetail } from '@/types/product';
import ProductCard from './ProductCard';

afterEach(cleanup);

const baseProduct: ProductDetail = {
  id: 'prod-1',
  name: 'Vestido floral',
  store: { id: 'store-1', name: 'Brechó Ana', city: 'Porto Alegre' },
  price: 89.9,
  coverImageUrl: 'https://example.com/vestido.jpg',
  category: 'Roupas',
  size: 'M',
  color: 'Floral',
  brand: 'Farm',
  condition: 'Seminovo',
  description: 'Vestido floral, tamanho M. Estado: seminovo.',
  status: 'ativo',
  media: [{ type: 'image', url: 'https://example.com/vestido.jpg', position: 0 }],
};

// O ProductCard usa <Link> do react-router-dom, que precisa de um Router ancestral.
const renderCard = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('<ProductCard />', () => {
  // Objetivo: garantir que os campos do produto aparecem no cartão.
  it('renderiza os campos do produto', () => {
    renderCard(<ProductCard product={baseProduct} onOpen={() => {}} />);

    expect(screen.getByText('Vestido floral')).toBeTruthy();
    expect(screen.getByText('Brechó Ana · Porto Alegre')).toBeTruthy();
    expect(screen.getByText(/R\$\s?89,90/)).toBeTruthy();
    expect(screen.getByText('Roupas')).toBeTruthy();
    expect(screen.getByText('Seminovo')).toBeTruthy();

    const image = screen.getByAltText('Vestido floral');
    expect(image.tagName).toBe('IMG');
  });

  // Objetivo: sem coverImageUrl, mostra um placeholder e não quebra a renderização.
  it('usa um placeholder quando não há coverImageUrl', () => {
    const productWithoutImage: ProductDetail = { ...baseProduct, coverImageUrl: null };
    renderCard(<ProductCard product={productWithoutImage} onOpen={() => {}} />);

    const placeholder = screen.getByRole('img', { name: 'Vestido floral' });
    expect(placeholder.tagName).not.toBe('IMG');
    expect(screen.getByText('Vestido floral')).toBeTruthy();
  });

  // Objetivo: o título do produto é um link real (role implícito de link).
  it('renderiza o título como um link', () => {
    renderCard(<ProductCard product={baseProduct} onOpen={() => {}} />);

    expect(screen.getByRole('link', { name: 'Vestido floral' })).toBeInTheDocument();
  });

  // Objetivo: sem productPath, o link usa o placeholder e a navegação fica a cargo
  // de onOpen — clicar no título dispara onOpen com o id e não altera a URL.
  it('dispara onOpen com o id do produto ao clicar no título', async () => {
    const user = userEvent.setup();
    const handleOpen = vi.fn();
    renderCard(<ProductCard product={baseProduct} onOpen={handleOpen} />);

    await user.click(screen.getByRole('link', { name: 'Vestido floral' }));

    expect(handleOpen).toHaveBeenCalledTimes(1);
    expect(handleOpen).toHaveBeenCalledWith('prod-1');
  });

  // Objetivo: acionar o link pelo teclado (Enter) equivale ao clique.
  it('dispara onOpen ao pressionar Enter com o link do título focado', async () => {
    const user = userEvent.setup();
    const handleOpen = vi.fn();
    renderCard(<ProductCard product={baseProduct} onOpen={handleOpen} />);

    screen.getByRole('link', { name: 'Vestido floral' }).focus();
    await user.keyboard('{Enter}');

    expect(handleOpen).toHaveBeenCalledTimes(1);
    expect(handleOpen).toHaveBeenCalledWith('prod-1');
  });

  // Objetivo: quando a rota real do produto é informada, ela vira o destino do link
  // e o clique continua chamando onOpen (sem preventDefault do placeholder).
  it('usa productPath como destino do link quando fornecido', async () => {
    const user = userEvent.setup();
    const handleOpen = vi.fn();
    renderCard(
      <ProductCard product={baseProduct} onOpen={handleOpen} productPath="/produto/prod-1" />,
    );

    const link = screen.getByRole('link', { name: 'Vestido floral' });
    expect(link).toHaveAttribute('href', '/produto/prod-1');

    await user.click(link);

    expect(handleOpen).toHaveBeenCalledTimes(1);
    expect(handleOpen).toHaveBeenCalledWith('prod-1');
  });

  // Objetivo: garantir que o favoriteSlot recebido é renderizado dentro do cartão.
  it('renderiza o favoriteSlot quando fornecido', () => {
    renderCard(
      <ProductCard
        product={baseProduct}
        onOpen={() => {}}
        favoriteSlot={<button aria-label="Favoritar">♥</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'Favoritar' })).toBeTruthy();
  });

  // Objetivo: o favoriteSlot é irmão do link esticado (não descendente) e clicável
  // de forma independente — acioná-lo não dispara o onOpen do cartão. Sem
  // stopPropagation: não há mais aninhamento de interativo dentro de interativo.
  it('o favoriteSlot é um elemento irmão clicável e independente do link', async () => {
    const user = userEvent.setup();
    const handleOpen = vi.fn();
    const handleFavorite = vi.fn();
    renderCard(
      <ProductCard
        product={baseProduct}
        onOpen={handleOpen}
        favoriteSlot={
          <button type="button" aria-label="Favoritar" onClick={handleFavorite}>
            ♥
          </button>
        }
      />,
    );

    const link = screen.getByRole('link', { name: 'Vestido floral' });
    const favoriteButton = screen.getByRole('button', { name: 'Favoritar' });
    expect(link).not.toContainElement(favoriteButton);

    await user.click(favoriteButton);

    expect(handleFavorite).toHaveBeenCalledTimes(1);
    expect(handleOpen).not.toHaveBeenCalled();
  });
});
