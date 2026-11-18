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

function renderLayout(children: React.ReactNode, productDetailLayout = false, initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <CartContext.Provider value={CART_VALUE}>
          <Layout productDetailLayout={productDetailLayout}>{children}</Layout>
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

  it('usa a composição própria do produto sem rodapé ou FAB global', () => {
    renderLayout(null, true, '/product/1');

    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Abrir assistente Vintex' }),
    ).not.toBeInTheDocument();
  });

  it('usa a barra compacta na rota do produto', () => {
    renderLayout(null, false, '/product/1');

    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compartilhar produto' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
  });

  // --- #207: FAB da Vintex só no mobile/tablet, spotlight assume no web ---

  it('renderiza o FAB da Vintex escondido a partir do tablet (só mobile)', () => {
    renderLayout(null);

    const fab = screen.getByRole('button', { name: 'Abrir assistente Vintex' });
    expect(fab.parentElement).toHaveClass('tablet:hidden');
  });

  it('mantém o FAB na posição padrão em páginas fora do detalhe de produto', () => {
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
