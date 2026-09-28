import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { CartContext, type CartContextValue } from '@/context/useCart';
import Layout from './Layout';

const CART_VALUE: CartContextValue = {
  cart: { groups: [] },
  count: 0,
  loading: false,
  error: null,
  add: async () => {},
  remove: async () => {},
  refresh: async () => {},
};

/** Só pra ler a rota atual do MemoryRouter depois do clique no FAB. */
function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location-probe">{location.pathname}</p>;
}

afterEach(cleanup);

function renderLayout(children: React.ReactNode, bottomSpacer = false) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <CartContext.Provider value={CART_VALUE}>
          <Layout bottomSpacer={bottomSpacer}>{children}</Layout>
        </CartContext.Provider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('<Layout />', () => {
  it('renders header, page content and footer', () => {
    renderLayout(<p>Conteúdo da página</p>);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo da página')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  /**
   * Sem a faixa, a barra `fixed` do detalhe da peça cobre as últimas linhas do
   * rodapé abaixo de `web`: compensar dentro do `<main>` não resolve, porque o
   * rodapé é irmão posterior do conteúdo.
   */
  it('reserva a faixa abaixo do rodapé só quando pedida', () => {
    const semFaixa = renderLayout(null);
    expect(semFaixa.container.querySelector('.h-28')).not.toBeInTheDocument();
    cleanup();

    const comFaixa = renderLayout(null, true);
    const faixa = comFaixa.container.querySelector('.h-28');
    expect(faixa).toBeInTheDocument();
    expect(faixa).toHaveClass('web:hidden');
    expect(screen.getByRole('contentinfo').compareDocumentPosition(faixa!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('mantém a navegação principal acessível no mobile e visível no desktop', () => {
    renderLayout(null);

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveClass('hidden', 'tablet:flex');
    expect(screen.getByRole('button', { name: 'Abrir menu principal' })).toBeInTheDocument();
  });

  // --- #207: FAB da Vintex só no mobile/tablet, spotlight assume no web ---

  it('renderiza o FAB da Vintex escondido a partir do tablet (só mobile)', () => {
    renderLayout(null);

    const fab = screen.getByRole('button', { name: 'Abrir assistente Vintex' });
    expect(fab.parentElement).toHaveClass('tablet:hidden');
  });

  it('sobe o FAB (raised) quando bottomSpacer é true, sem sobrepor a barra fixa', () => {
    renderLayout(null, true);

    const fab = screen.getByRole('button', { name: 'Abrir assistente Vintex' });
    expect(fab.parentElement).toHaveClass('bottom-24');
    expect(fab.parentElement).toHaveClass('web:bottom-5');
  });

  it('mantém o FAB na posição padrão quando bottomSpacer é false', () => {
    renderLayout(null);

    const fab = screen.getByRole('button', { name: 'Abrir assistente Vintex' });
    expect(fab.parentElement).toHaveClass('bottom-5');
    expect(fab.parentElement).not.toHaveClass('bottom-24');
  });

  it('clicar no FAB navega para /vintex', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <CartContext.Provider value={CART_VALUE}>
            <Layout>
              <LocationProbe />
            </Layout>
          </CartContext.Provider>
        </AuthProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente Vintex' }));

    expect(screen.getByTestId('location-probe')).toHaveTextContent('/vintex');
  });
});
