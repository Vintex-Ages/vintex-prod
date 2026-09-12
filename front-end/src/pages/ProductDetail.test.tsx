import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from '@/context/useAuth';
import type { AuthUser } from '@/types/auth';
import ProductDetail from './ProductDetail';

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

const SAMPLE_USER: AuthUser = {
  id: 'u_1',
  name: 'Ana Brechó',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

function renderAt(path: string, options?: { authenticated?: boolean }) {
  if (options?.authenticated) {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
  }

  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/product/:id" element={<ProductDetail />} />
        </Routes>
      </AuthProvider>
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

  it('botão de ação final mostra "Comprar Agora" com o preço', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.getByRole('button', { name: /Comprar Agora.*R\$\s?79,90/ })).toBeTruthy();
  });

  it('peça vendida (status "vendido") mostra o selo "Já vendida"', async () => {
    renderAt('/product/4');

    await screen.findByRole('heading', { name: 'Zara Vestido Estampado' });

    expect(screen.getByText('Já vendida')).toBeInTheDocument();
  });

  it('peça vendida continua navegável — mostra o resto da ficha normalmente', async () => {
    renderAt('/product/4');

    await screen.findByRole('heading', { name: 'Zara Vestido Estampado' });

    expect(screen.getByText('Zara')).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s?149,90/).length).toBeGreaterThan(0);
  });

  it('peça ativa (status "ativo") NÃO mostra o selo e mantém "Comprar Agora" habilitado', async () => {
    renderAt('/product/1');

    await screen.findByRole('heading', { name: 'Nike Camiseta Preto' });

    expect(screen.queryByText('Já vendida')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Comprar Agora/ })).toBeEnabled();
  });

  /**
   * FE-US012-5 (#88): a partir desta task, os DOIS botões (favoritar e
   * comprar) ficam desabilitados quando a peça está vendida — revisão da
   * decisão da FE-US012-4 (#87), que tinha deixado só o favoritar ativo.
   * Critério explícito da #88, que cita a #87 como já cobrindo os dois.
   */
  it('peça vendida: favoritar e comprar ficam desabilitados, mesmo logado', async () => {
    renderAt('/product/4', { authenticated: true });

    await screen.findByRole('heading', { name: 'Zara Vestido Estampado' });

    expect(screen.getByRole('button', { name: 'Adicionar aos favoritos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Comprar Agora/ })).toBeDisabled();
  });

  describe('barreira de login (FE-US012-5, #88)', () => {
    it('deslogado: favoritar abre a barreira de login', async () => {
      const user = userEvent.setup();
      renderAt('/product/1');

      await user.click(await screen.findByRole('button', { name: 'Adicionar aos favoritos' }));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('deslogado: comprar abre a barreira de login', async () => {
      const user = userEvent.setup();
      renderAt('/product/1');

      await user.click(await screen.findByRole('button', { name: /Comprar Agora/ }));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('na barreira, "Entrar" navega para /login guardando a origem', async () => {
      const user = userEvent.setup();
      renderAt('/product/1');

      await user.click(await screen.findByRole('button', { name: 'Adicionar aos favoritos' }));
      await screen.findByRole('dialog');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('na barreira, "Agora não" fecha sem navegar', async () => {
      const user = userEvent.setup();
      renderAt('/product/1');

      await user.click(await screen.findByRole('button', { name: 'Adicionar aos favoritos' }));
      await screen.findByRole('dialog');
      await user.click(screen.getByRole('button', { name: 'Agora não' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(await screen.findByRole('heading', { name: 'Nike Camiseta Preto' })).toBeTruthy();
    });

    it('logado: favoritar alterna o estado visual sem abrir a barreira', async () => {
      const user = userEvent.setup();
      renderAt('/product/1', { authenticated: true });

      const favoriteButton = await screen.findByRole('button', { name: 'Adicionar aos favoritos' });
      expect(favoriteButton).toHaveAttribute('aria-pressed', 'false');

      await user.click(favoriteButton);

      expect(screen.getByRole('button', { name: 'Remover dos favoritos' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('logado: comprar não abre a barreira', async () => {
      const user = userEvent.setup();
      renderAt('/product/1', { authenticated: true });

      await user.click(await screen.findByRole('button', { name: /Comprar Agora/ }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
