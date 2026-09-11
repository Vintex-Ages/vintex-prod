import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  // NOTA: categoria e cor (também exigidos pelo ticket) ficaram de fora da
  // ficha visível por decisão explícita, pra bater com o layout do print de
  // referência (T-02) — ver JSDoc do componente.
  it('mostra marca, tamanho, conservação, material, medidas, cidade, preço e a história da peça', async () => {
    renderAt('/product/1');

    expect(await screen.findByRole('heading', { name: 'Nike Camiseta Preto' })).toBeTruthy();
    expect(screen.getByText('Nike')).toBeTruthy();
    expect(screen.getByText('M (Médio)')).toBeTruthy();
    expect(screen.getByText('Seminovo')).toBeTruthy();
    expect(screen.getByText('100% algodão')).toBeTruthy();
    expect(screen.getByText('Ombro a ombro 44cm • Comprimento 68cm')).toBeTruthy();
    expect(screen.getAllByText('Porto Alegre').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s?79,90/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Peça garimpada no Mercado Público de Porto Alegre/)).toBeTruthy();
  });

  it('mostra a trilha de navegação (início / cidade / loja / produto)', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    const trilha = screen.getByRole('navigation', { name: 'Trilha' });
    expect(within(trilha).getByRole('link', { name: 'Início' })).toHaveAttribute('href', '/');
    expect(within(trilha).getByText('Porto Alegre')).toBeTruthy();
    expect(
      within(trilha).getAllByText('Brechó Mercado Público', { exact: false }).length,
    ).toBeGreaterThan(0);
    expect(within(trilha).getByText('Nike Camiseta Preto')).toHaveAttribute('aria-current', 'page');
  });

  it('mostra as demais fotos da peça como miniaturas abaixo da capa', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.getAllByAltText('Nike Camiseta Preto — foto adicional')).toHaveLength(2);
  });

  it('mostra carregando antes do produto resolver', () => {
    renderAt('/product/1');

    expect(screen.getByText('Carregando produto...')).toBeTruthy();
  });

  it('mostra nome da loja e o selo de verificado quando a loja é verificada', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.getAllByText('Brechó Mercado Público').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'Confiável' })).toBeTruthy();
  });

  it('não mostra o selo de verificado quando a loja não é verificada', async () => {
    renderAt('/product/3');

    await screen.findByRole('heading', { name: 'Adidas Tênis Branco' });

    expect(screen.getAllByText('Roupa Rodada').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: 'Confiável' })).toBeNull();
  });

  // Objetivo declarado do ticket: card da loja linka o perfil do brechó.
  it('o card da loja é um link', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.getByRole('link', { name: /Ver loja/ })).toBeTruthy();
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

  it('botão de ação final mostra "Comprar Agora" com o preço', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.getByRole('button', { name: /Comprar Agora.*R\$\s?79,90/ })).toBeTruthy();
  });
});
