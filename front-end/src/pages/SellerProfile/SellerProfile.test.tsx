import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import SellerProfile from './SellerProfile';
import { getStore, getStoreProducts, StoreError } from '@/services/storeService';
import type { Paginated, Product } from '@/types/product';
import type { StoreProfile } from '@/types/store';

vi.mock('@/services/storeService', () => ({
  getStore: vi.fn(),
  getStoreProducts: vi.fn(),
  StoreError: class StoreError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'StoreError';
    }
  },
}));

const mockStore: StoreProfile = {
  id: '1',
  name: 'Brechó Ana',
  description: 'Peças únicas de brechó no Rio Grande do Sul.',
  logoUrl: null,
  city: 'Porto Alegre',
  state: 'RS',
  verification: 'confiavel',
  createdAt: '2024-01-01T00:00:00.000Z',
  metrics: {
    activeProducts: 5,
    soldProducts: 10,
    monthsOnPlatform: 6,
  },
};

const mockProduct: Product = {
  id: 'p1',
  name: 'Camiseta Nike',
  price: 50,
  coverImageUrl: null,
  store: { id: '1', name: 'Brechó Ana' },
};

function renderPage(id = '1') {
  return render(
    <MemoryRouter initialEntries={[`/store/${id}`]}>
      <Routes>
        <Route path="/store/:id" element={<SellerProfile />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SellerProfile', () => {
  it('renderiza o cabeçalho da loja e a grade de produtos a partir do mock', async () => {
    vi.mocked(getStore).mockResolvedValue(mockStore);
    vi.mocked(getStoreProducts).mockResolvedValue({
      items: [mockProduct],
      page: 1,
      pageSize: 20,
      total: 1,
    } satisfies Paginated<Product>);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Brechó Ana')).toBeInTheDocument();
    });
    expect(screen.getByText('Porto Alegre')).toBeInTheDocument();
    expect(await screen.findByText('Camiseta Nike')).toBeInTheDocument();
  });

  it('funciona sem estar logado — não depende de nenhum contexto de autenticação', async () => {
    vi.mocked(getStore).mockResolvedValue(mockStore);
    vi.mocked(getStoreProducts).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Brechó Ana')).toBeInTheDocument();
    });
  });

  it('mostra "loja não encontrada" sem botão de tentar de novo quando o id não existe', async () => {
    vi.mocked(getStore).mockRejectedValue(new StoreError('STORE_NOT_FOUND', 'não encontrada'));

    renderPage('inexistente');

    expect(await screen.findByText('Loja não encontrada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tentar de novo/i })).not.toBeInTheDocument();
  });

  it('mostra erro com botão de tentar de novo em falha de rede, e refaz a busca ao clicar', async () => {
    vi.mocked(getStore)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(mockStore);
    vi.mocked(getStoreProducts).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    const user = userEvent.setup();

    renderPage();

    const retry = await screen.findByRole('button', { name: /tentar de novo/i });
    await user.click(retry);

    await waitFor(() => {
      expect(screen.getByText('Brechó Ana')).toBeInTheDocument();
    });
  });

  it('mostra o estado vazio quando a loja não tem peças ativas', async () => {
    vi.mocked(getStore).mockResolvedValue(mockStore);
    vi.mocked(getStoreProducts).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    renderPage();

    expect(await screen.findByText('Essa loja ainda não tem peças ativas.')).toBeInTheDocument();
  });

  it('mostra "Em breve" quando avaliação e taxa de envio não existem', async () => {
    vi.mocked(getStore).mockResolvedValue(mockStore);
    vi.mocked(getStoreProducts).mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });

    renderPage();

    await waitFor(() => {
      const emBreve = screen.getAllByText('Em breve');
      expect(emBreve).toHaveLength(2);
    });
  });

  it('carrega mais produtos ao clicar em "Carregar mais"', async () => {
    vi.mocked(getStore).mockResolvedValue(mockStore);
    vi.mocked(getStoreProducts)
      .mockResolvedValueOnce({ items: [mockProduct], page: 1, pageSize: 1, total: 2 })
      .mockResolvedValueOnce({
        items: [{ ...mockProduct, id: 'p2', name: 'Vestido Floral' }],
        page: 2,
        pageSize: 1,
        total: 2,
      });
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Camiseta Nike');
    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));

    expect(await screen.findByText('Vestido Floral')).toBeInTheDocument();
    expect(getStoreProducts).toHaveBeenCalledWith('1', { page: 2, pageSize: 20 });
  });
});
