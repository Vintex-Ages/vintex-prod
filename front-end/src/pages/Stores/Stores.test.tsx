import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { getStoreProducts, searchStores } from '@/services/storeService';
import type { Paginated, Product } from '@/types/product';
import type { StoreSummary } from '@/types/store';
import Stores from './Stores';

vi.mock('@/services/storeService', () => ({
  searchStores: vi.fn(),
  getStoreProducts: vi.fn(),
}));

/** Mostra o id recebido para conferir que o cartão abriu o perfil certo (#223). */
function StoreProfileProbe() {
  const { id } = useParams<{ id: string }>();
  return <h1>Perfil da loja {id}</h1>;
}

function renderStores() {
  return render(
    <MemoryRouter initialEntries={['/stores']}>
      <Routes>
        <Route path="/stores" element={<Stores />} />
        <Route path="/store/:id" element={<StoreProfileProbe />} />
        <Route path="/catalog" element={<h1>Catálogo</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

const redencao: StoreSummary = {
  id: '10',
  name: 'Brechó Redenção',
  description: null,
  logoUrl: null,
  city: 'Porto Alegre',
  state: 'RS',
  verified: true,
  activeCount: 7,
};

const aurora: StoreSummary = {
  id: '11',
  name: 'Brechó Aurora',
  description: null,
  logoUrl: null,
  city: 'Canoas',
  state: 'RS',
  verified: false,
  activeCount: 3,
};

function pagina(items: StoreSummary[], page = 1, total = items.length): Paginated<StoreSummary> {
  return { items, page, pageSize: 20, total };
}

function peca(id: string, name: string, storeId: string, storeName: string): Product {
  return {
    id,
    name,
    price: 120,
    coverImageUrl: 'https://example.test/peca.jpg',
    store: { id: storeId, name: storeName },
  };
}

/** Prévia mockada: toda loja devolve duas peças, com o nome da própria loja. */
function previewPadrao(): Promise<Paginated<Product>> {
  return Promise.resolve({
    items: [
      peca('p1', 'Jaqueta jeans', '10', 'Brechó Redenção'),
      peca('p2', 'Vestido floral', '10', 'Brechó Redenção'),
    ],
    page: 1,
    pageSize: 2,
    total: 7,
  });
}

beforeEach(() => {
  vi.mocked(searchStores).mockReset();
  vi.mocked(getStoreProducts).mockReset();
  vi.mocked(getStoreProducts).mockImplementation(previewPadrao);
});

afterEach(cleanup);

describe('<Stores />', () => {
  it('lista todos os brechós quando a busca está vazia', async () => {
    vi.mocked(searchStores).mockResolvedValue(pagina([redencao, aurora]));

    renderStores();

    expect(await screen.findByRole('heading', { name: 'Brechó Redenção' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Brechó Aurora' })).toBeInTheDocument();
    expect(searchStores).toHaveBeenCalledWith('', 1);
  });

  it('mostra a prévia de até duas peças de cada brechó dentro do cartão', async () => {
    vi.mocked(searchStores).mockResolvedValue(pagina([redencao]));

    renderStores();

    const titulo = await screen.findByRole('heading', { name: 'Brechó Redenção' });
    const article = titulo.closest('article');
    if (!article) throw new Error('cartão do brechó não encontrado');

    await waitFor(() => {
      expect(within(article).getByAltText('Jaqueta jeans')).toBeInTheDocument();
    });
    expect(within(article).getByAltText('Vestido floral')).toBeInTheDocument();
    expect(getStoreProducts).toHaveBeenCalledWith('10', { page: 1, pageSize: 2 });
  });

  // Objetivo declarado 1: "lojas distintas dos produtos".
  it('buscar "Redenção" mostra o brechó e não peças soltas', async () => {
    const user = userEvent.setup();
    vi.mocked(searchStores).mockImplementation((q) =>
      Promise.resolve(q ? pagina([redencao]) : pagina([redencao, aurora])),
    );

    renderStores();

    expect(await screen.findByRole('heading', { name: 'Brechó Aurora' })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Buscar por nome do brechó…'), 'Redenção');

    await waitFor(() => expect(searchStores).toHaveBeenLastCalledWith('Redenção', 1));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Brechó Aurora' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { name: 'Brechó Redenção' })).toBeInTheDocument();
    // As peças aparecem só como prévia; nenhuma vira link de produto na página.
    expect(document.querySelector('a[href^="/product/"]')).toBeNull();
  });

  // Objetivo declarado 2.
  it('clicar no cartão abre o perfil da loja', async () => {
    vi.mocked(searchStores).mockResolvedValue(pagina([redencao]));

    renderStores();

    fireEvent.click(await screen.findByRole('button', { name: 'Brechó Redenção' }));

    expect(await screen.findByRole('heading', { name: 'Perfil da loja 10' })).toBeInTheDocument();
  });

  it('sem resultado mostra "Nenhum brechó com esse nome" e leva ao catálogo com o termo', async () => {
    const user = userEvent.setup();
    vi.mocked(searchStores).mockResolvedValue(pagina([], 1, 0));

    renderStores();

    await user.type(screen.getByPlaceholderText('Buscar por nome do brechó…'), 'Redenção');

    expect(await screen.findByText('Nenhum brechó com esse nome')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buscar peças no catálogo' })).toHaveAttribute(
      'href',
      '/catalog?q=Reden%C3%A7%C3%A3o',
    );
  });

  it('erro de carga mostra o ErrorState e "Tentar de novo" recarrega a lista', async () => {
    vi.mocked(searchStores)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValueOnce(pagina([redencao]));

    renderStores();

    expect(
      await screen.findByText('Não foi possível carregar os brechós agora.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('heading', { name: 'Brechó Redenção' })).toBeInTheDocument();
    expect(searchStores).toHaveBeenCalledTimes(2);
  });

  it('"Carregar mais" busca a próxima página e acrescenta os brechós', async () => {
    vi.mocked(searchStores).mockImplementation((_q, page) =>
      Promise.resolve(page === 1 ? pagina([redencao], 1, 2) : pagina([aurora], 2, 2)),
    );

    renderStores();

    expect(await screen.findByRole('heading', { name: 'Brechó Redenção' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByRole('heading', { name: 'Brechó Aurora' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Brechó Redenção' })).toBeInTheDocument();
    expect(searchStores).toHaveBeenLastCalledWith('', 2);
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('falha da prévia não derruba o cartão da loja', async () => {
    vi.mocked(searchStores).mockResolvedValue(pagina([redencao]));
    vi.mocked(getStoreProducts).mockRejectedValue(new Error('sem prévia'));

    renderStores();

    expect(await screen.findByRole('heading', { name: 'Brechó Redenção' })).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível carregar/)).not.toBeInTheDocument();
  });
});
