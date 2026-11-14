import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/context/ToastContext';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { CartContext, type CartContextValue } from '@/context/useCart';
import { FavoritesContext, type FavoritesContextValue } from '@/context/useFavorites';
import { listFavorites } from '@/services/favoriteService';
import type { FavoriteProduct } from '@/types/favorite';
import type { Paginated, ProductStatus } from '@/types/product';
import { paths } from '@/routes/paths';
import FavoritesPage from './Favorites';

vi.mock('@/services/favoriteService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/favoriteService')>()),
  listFavorites: vi.fn(),
}));

const AUTH: AuthContextValue = {
  user: { id: 'u_1', name: 'Ana', email: 'ana@exemplo.com', is_seller: false, is_admin: false },
  token: 't',
  isAuthenticated: true,
  loading: false,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
};

function favorito(id: string, name: string, status: ProductStatus): FavoriteProduct {
  return {
    id,
    name,
    price: 159.9,
    coverImageUrl: null,
    store: { id: '3', name: 'Brechó da Ana' },
    status,
  };
}

function pagina(
  items: FavoriteProduct[],
  page = 1,
  total = items.length,
): Paginated<FavoriteProduct> {
  return { items, page, pageSize: 20, total };
}

function cartValue(add: CartContextValue['add']): CartContextValue {
  return {
    cart: { groups: [] },
    count: 0,
    loading: false,
    error: null,
    add,
    remove: async () => {},
    refresh: async () => {},
  };
}

type Setup = {
  setFavorite?: FavoritesContextValue['setFavorite'];
  add?: CartContextValue['add'];
};

/** Página real, com o contexto de favoritos e o carrinho em memória. */
function renderPage({ setFavorite = async () => {}, add = async () => {} }: Setup = {}) {
  const favorites: FavoritesContextValue = {
    ids: new Set(['1']),
    toggle: async () => {},
    setFavorite,
    loading: false,
  };

  return render(
    <MemoryRouter initialEntries={[paths.favorites]}>
      <AuthContext.Provider value={AUTH}>
        <CartContext.Provider value={cartValue(add)}>
          <FavoritesContext.Provider value={favorites}>
            <ToastProvider>
              <Routes>
                <Route path={paths.favorites} element={<FavoritesPage />} />
                <Route path={paths.catalog} element={<h1>Catálogo</h1>} />
                <Route path={paths.cart} element={<h1>Carrinho</h1>} />
                <Route path={paths.product} element={<h1>Detalhe da peça</h1>} />
              </Routes>
            </ToastProvider>
          </FavoritesContext.Provider>
        </CartContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

/** Linha da peça na lista. */
function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement;
}

describe('<Favorites />', () => {
  beforeEach(() => {
    vi.mocked(listFavorites).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('mostra o esqueleto enquanto a lista não chega', async () => {
    let resolve!: (value: Paginated<FavoriteProduct>) => void;
    vi.mocked(listFavorites).mockReturnValue(
      new Promise<Paginated<FavoriteProduct>>((done) => {
        resolve = done;
      }),
    );

    renderPage();

    expect(screen.getByRole('status', { name: 'Carregando favoritos' })).toBeInTheDocument();
    expect(screen.getByTestId('favorites-skeleton')).toBeInTheDocument();

    resolve(pagina([favorito('1', 'Jaqueta jeans', 'ativo')]));

    expect(await screen.findByText('Jaqueta jeans')).toBeInTheDocument();
    expect(screen.queryByTestId('favorites-skeleton')).not.toBeInTheDocument();
  });

  it('lista as peças favoritadas com a ação de adicionar ao carrinho', async () => {
    vi.mocked(listFavorites).mockResolvedValue(
      pagina([favorito('1', 'Jaqueta jeans', 'ativo'), favorito('2', 'Vestido floral', 'ativo')]),
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Meus favoritos' }),
    ).toBeInTheDocument();

    const lista = screen.getByRole('list', { name: 'Peças favoritadas' });
    const linhas = within(lista).getAllByRole('listitem');

    expect(linhas).toHaveLength(2);
    expect(within(linhas[0]).getByText('Jaqueta jeans')).toBeInTheDocument();
    expect(within(linhas[0]).getByText('Brechó da Ana')).toBeInTheDocument();
    expect(within(linhas[0]).getByText('Disponível')).toBeInTheDocument();
    expect(within(linhas[0]).getByRole('button', { name: 'Adicionar ao carrinho' })).toBeEnabled();
    expect(within(linhas[1]).getByText('Vestido floral')).toBeInTheDocument();
  });

  it('peça vendida, reservada ou pausada aparece Indisponível, com a ação desabilitada', async () => {
    vi.mocked(listFavorites).mockResolvedValue(
      pagina([
        favorito('1', 'Jaqueta jeans', 'ativo'),
        favorito('2', 'Vestido floral', 'reservado'),
        favorito('3', 'Saia midi', 'despublicado'),
        favorito('4', 'Blusa tricot', 'vendido'),
      ]),
    );

    renderPage();
    await screen.findByText('Jaqueta jeans');

    expect(within(rowOf('Jaqueta jeans')).getByText('Disponível')).toBeInTheDocument();
    expect(
      within(rowOf('Jaqueta jeans')).getByRole('button', { name: 'Adicionar ao carrinho' }),
    ).toBeEnabled();

    const reservada = rowOf('Vestido floral');
    expect(within(reservada).getByText('Indisponível')).toBeInTheDocument();
    expect(within(reservada).getByRole('button', { name: 'Adicionar ao carrinho' })).toBeDisabled();

    const pausada = rowOf('Saia midi');
    expect(within(pausada).getByText('Indisponível')).toBeInTheDocument();
    expect(within(pausada).getByRole('button', { name: 'Adicionar ao carrinho' })).toBeDisabled();

    const vendida = rowOf('Blusa tricot');
    expect(within(vendida).getByText('Vendido')).toBeInTheDocument();
    expect(within(vendida).getByRole('button', { name: 'Adicionar ao carrinho' })).toBeDisabled();
  });

  it('adiciona ao carrinho e mantém a peça na lista', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    vi.mocked(listFavorites).mockResolvedValue(pagina([favorito('1', 'Jaqueta jeans', 'ativo')]));

    renderPage({ add });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));

    expect(add).toHaveBeenCalledWith('1');
    expect(await screen.findByText('Adicionada ao carrinho')).toBeInTheDocument();
    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar ao carrinho' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ver carrinho' })).toBeInTheDocument();
  });

  it('falha ao adicionar avisa e mantém a peça na lista', async () => {
    const add = vi.fn().mockRejectedValue(new Error('fora do ar'));
    vi.mocked(listFavorites).mockResolvedValue(pagina([favorito('1', 'Jaqueta jeans', 'ativo')]));

    renderPage({ add });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Adicionar ao carrinho' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível adicionar ao carrinho. Tente novamente.',
    );
    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();
  });

  it('remover tira a peça da lista pelo setFavorite', async () => {
    const setFavorite = vi.fn().mockResolvedValue(undefined);
    vi.mocked(listFavorites).mockResolvedValue(
      pagina([favorito('1', 'Jaqueta jeans', 'ativo'), favorito('2', 'Vestido floral', 'ativo')]),
    );

    renderPage({ setFavorite });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Remover Jaqueta jeans' }));

    expect(setFavorite).toHaveBeenCalledWith('1', false);
    await waitFor(() => expect(screen.queryByText('Jaqueta jeans')).not.toBeInTheDocument());
    expect(screen.getByText('Vestido floral')).toBeInTheDocument();
  });

  it('remover a última peça mostra o estado vazio', async () => {
    vi.mocked(listFavorites).mockResolvedValue(pagina([favorito('1', 'Jaqueta jeans', 'ativo')]));

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Remover Jaqueta jeans' }));

    expect(await screen.findByText('Você ainda não favoritou nenhuma peça')).toBeInTheDocument();
  });

  it('falha ao remover mantém a peça e avisa', async () => {
    const setFavorite = vi.fn().mockRejectedValue(new Error('fora do ar'));
    vi.mocked(listFavorites).mockResolvedValue(pagina([favorito('1', 'Jaqueta jeans', 'ativo')]));

    renderPage({ setFavorite });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Remover Jaqueta jeans' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível remover dos favoritos. Tente novamente.',
    );
    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();
  });

  it('sem favoritos mostra o EmptyState e leva ao catálogo', async () => {
    vi.mocked(listFavorites).mockResolvedValue(pagina([]));

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByText('Você ainda não favoritou nenhuma peça')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Explorar o catálogo' }));

    expect(await screen.findByRole('heading', { name: 'Catálogo' })).toBeInTheDocument();
  });

  it('falha ao carregar mostra o ErrorState e o retry recarrega a lista', async () => {
    vi.mocked(listFavorites)
      .mockRejectedValueOnce(new Error('fora do ar'))
      .mockResolvedValueOnce(pagina([favorito('1', 'Jaqueta jeans', 'ativo')]));

    renderPage();
    const user = userEvent.setup();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar seus favoritos.',
    );

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Jaqueta jeans')).toBeInTheDocument();
  });

  it('carrega a próxima página quando a lista é maior que a primeira', async () => {
    vi.mocked(listFavorites)
      .mockResolvedValueOnce(pagina([favorito('1', 'Jaqueta jeans', 'ativo')], 1, 2))
      .mockResolvedValueOnce(pagina([favorito('2', 'Vestido floral', 'ativo')], 2, 2));

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByText('Vestido floral')).toBeInTheDocument();
    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('abre o detalhe da peça pelo nome', async () => {
    vi.mocked(listFavorites).mockResolvedValue(pagina([favorito('1', 'Jaqueta jeans', 'ativo')]));

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Jaqueta jeans' }));

    expect(await screen.findByRole('heading', { name: 'Detalhe da peça' })).toBeInTheDocument();
  });
});
