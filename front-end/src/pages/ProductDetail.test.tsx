import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProductDetail from './ProductDetail';

afterEach(cleanup);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/product/:id" element={<ProductDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<ProductDetail />', () => {
  // Objetivo declarado do ticket: mostra atributos, preço e card da loja.
  it('mostra categoria, tamanho, cor, marca, conservação, cidade, preço e descrição', async () => {
    renderAt('/product/1');

    expect(await screen.findByRole('heading', { name: 'Nike Camiseta Preto' })).toBeTruthy();
    expect(screen.getByText('Roupas')).toBeTruthy();
    expect(screen.getByText('M')).toBeTruthy();
    expect(screen.getByText('Preto')).toBeTruthy();
    expect(screen.getByText('Nike')).toBeTruthy();
    expect(screen.getByText('Seminovo')).toBeTruthy();
    expect(screen.getAllByText('Porto Alegre').length).toBeGreaterThan(0);
    expect(screen.getByText(/R\$\s?79,90/)).toBeTruthy();
    expect(screen.getByText('Camiseta Nike, cor preto, tamanho M. Estado: seminovo.')).toBeTruthy();
  });

  it('mostra carregando antes do produto resolver', () => {
    renderAt('/product/1');

    expect(screen.getByText('Carregando produto...')).toBeTruthy();
  });

  it('mostra nome da loja e o selo de verificado quando a loja é verificada', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.getByText('Brechó Mercado Público')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Confiável' })).toBeTruthy();
  });

  it('não mostra o selo de verificado quando a loja não é verificada', async () => {
    renderAt('/product/3');

    await screen.findByRole('heading', { name: 'Adidas Tênis Branco' });

    expect(screen.getByText('Roupa Rodada')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Confiável' })).toBeNull();
  });

  // Objetivo declarado do ticket: card da loja linka o perfil do brechó.
  it('o card da loja é um link', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.getByRole('link', { name: /Brechó Mercado Público/ })).toBeTruthy();
  });

  it('mostra "produto não encontrado" para um id inexistente', async () => {
    renderAt('/product/inexistente');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/não encontrado/i));
  });

  it('favoritar alterna o estado visual do FavoriteButton', async () => {
    const user = userEvent.setup();
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    const favoriteButton = screen.getByRole('button', { name: 'Adicionar aos favoritos' });
    expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');

    await user.click(favoriteButton);

    expect(screen.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
