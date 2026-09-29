import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMine } from '@/services/sellerProductService';
import type { Paginated, SellerProduct } from '@/types/product';
import SellerAdmin from './SellerAdmin';

vi.mock('@/services/sellerProductService', () => ({
  getMine: vi.fn(),
}));

function peca(overrides: Partial<SellerProduct> = {}): SellerProduct {
  return {
    id: '1',
    name: 'Jaqueta jeans',
    price: 199.9,
    status: 'ativo',
    coverImageUrl: null,
    ...overrides,
  };
}

function pagina(items: SellerProduct[]): Paginated<SellerProduct> {
  return { items, page: 1, pageSize: 20, total: items.length };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/seller']}>
      <Routes>
        <Route path="/seller" element={<SellerAdmin />} />
        <Route path="/seller/products/new" element={<h1>Anunciar peça</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<SellerAdmin />', () => {
  it('mostra as contagens por status e a lista de peças', async () => {
    vi.mocked(getMine).mockResolvedValue(
      pagina([
        peca({ id: '1', name: 'Jaqueta jeans', status: 'ativo' }),
        peca({ id: '2', name: 'Camisa linho', status: 'ativo' }),
        peca({ id: '3', name: 'Bota Chelsea', status: 'vendido' }),
        peca({ id: '4', name: 'Bolsa palha', status: 'despublicado' }),
      ]),
    );

    renderPage();

    const anunciadas = await screen.findByTestId('stat-anunciadas');
    expect(within(anunciadas).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-vendidas')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-pausadas')).getByText('1')).toBeInTheDocument();

    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();
    expect(screen.getByText('Bota Chelsea')).toBeInTheDocument();
  });

  it('filtra a lista por status sem chamar o serviço de novo', async () => {
    vi.mocked(getMine).mockResolvedValue(
      pagina([
        peca({ id: '1', name: 'Jaqueta jeans', status: 'ativo' }),
        peca({ id: '2', name: 'Bota Chelsea', status: 'vendido' }),
      ]),
    );
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Jaqueta jeans');
    expect(getMine).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Vendidas' }));

    expect(screen.getByText('Bota Chelsea')).toBeInTheDocument();
    expect(screen.queryByText('Jaqueta jeans')).not.toBeInTheDocument();
    expect(getMine).toHaveBeenCalledTimes(1);
  });

  it('peça vendida continua listada, como histórico', async () => {
    vi.mocked(getMine).mockResolvedValue(
      pagina([peca({ id: '1', name: 'Bota Chelsea', status: 'vendido' })]),
    );

    renderPage();

    expect(await screen.findByText('Bota Chelsea')).toBeInTheDocument();
  });

  it('sem peças mostra o EmptyState com o CTA de anunciar', async () => {
    vi.mocked(getMine).mockResolvedValue(pagina([]));
    const user = userEvent.setup();

    renderPage();

    const mensagem = await screen.findByText(/anuncie sua primeira peça/i);
    const vazio = mensagem.closest('[role="status"]') as HTMLElement;

    await user.click(within(vazio).getByRole('button', { name: /anunciar peça/i }));

    expect(await screen.findByRole('heading', { name: 'Anunciar peça' })).toBeInTheDocument();
  });

  it('filtro sem resultado oferece voltar para todas, sem dizer que não há peças', async () => {
    vi.mocked(getMine).mockResolvedValue(
      pagina([peca({ id: '1', name: 'Jaqueta jeans', status: 'ativo' })]),
    );
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Jaqueta jeans');
    await user.click(screen.getByRole('button', { name: 'Vendidas' }));

    expect(screen.getByText(/nada com esse filtro/i)).toBeInTheDocument();
    expect(screen.queryByText(/anuncie sua primeira peça/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver todas' }));

    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();
  });

  it('conta e lista as peças de todas as páginas, não só da primeira', async () => {
    const primeira = Array.from({ length: 100 }, (_, i) =>
      peca({ id: `a${i}`, name: `Anunciada ${i}`, status: 'ativo' }),
    );
    vi.mocked(getMine)
      .mockResolvedValueOnce({ items: primeira, page: 1, pageSize: 100, total: 102 })
      .mockResolvedValueOnce({
        items: [
          peca({ id: 'v1', name: 'Bota Chelsea', status: 'vendido' }),
          peca({ id: 'p1', name: 'Bolsa palha', status: 'despublicado' }),
        ],
        page: 2,
        pageSize: 100,
        total: 102,
      });

    renderPage();

    const anunciadas = await screen.findByTestId('stat-anunciadas');
    expect(within(anunciadas).getByText('100')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-vendidas')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-pausadas')).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('102 peças no total')).toBeInTheDocument();
    expect(screen.getByText('Bota Chelsea')).toBeInTheDocument();
    expect(getMine).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 });
  });

  it('mostra o skeleton de linha enquanto carrega', () => {
    vi.mocked(getMine).mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Carregando suas peças…');
    expect(screen.getByTestId('seller-skeleton')).toBeInTheDocument();
  });

  it('mostra ErrorState com retry quando a busca falha', async () => {
    vi.mocked(getMine)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValueOnce(pagina([peca({ name: 'Jaqueta jeans' })]));
    const user = userEvent.setup();

    renderPage();

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();

    await user.click(within(alerta).getByRole('button', { name: /tentar de novo/i }));

    expect(await screen.findByText('Jaqueta jeans')).toBeInTheDocument();
    expect(getMine).toHaveBeenCalledTimes(2);
  });
});
