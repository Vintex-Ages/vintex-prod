import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { getFeed } from '@/services/catalogService';
import type { Paginated, Product } from '@/types/product';
import Home from './Home';

vi.mock('@/services/catalogService', () => ({ getFeed: vi.fn() }));

const feed: Paginated<Product> = {
  items: [
    {
      id: '1',
      name: 'Vestido floral',
      price: 89.9,
      coverImageUrl: 'https://example.com/vestido.jpg',
      store: { id: 'loja-1', name: 'Brechó Ana' },
    },
    {
      id: '2',
      name: 'Jaqueta jeans',
      price: 120,
      coverImageUrl: null,
      store: { id: 'loja-2', name: 'Brechó Bia' },
    },
  ],
  page: 1,
  pageSize: 20,
  total: 2,
};

function renderHome() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/product/1" element={<h1>Detalhe da peça</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getFeed).mockReset();
});
afterEach(cleanup);

describe('<Home />', () => {
  it('renderiza os dados do feed e preserva o placeholder para peças sem foto', async () => {
    vi.mocked(getFeed).mockResolvedValue(feed);
    renderHome();

    expect(await screen.findByRole('link', { name: 'Vestido floral' })).toBeInTheDocument();
    expect(getFeed).toHaveBeenCalledWith();
    expect(screen.getByRole('img', { name: 'Vestido floral' })).toHaveAttribute(
      'src',
      feed.items[0].coverImageUrl,
    );
    expect(screen.getByText(/R\$\s?89,90/)).toBeInTheDocument();
    expect(screen.getByText('Brechó Ana')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Jaqueta jeans' }).tagName).toBe('DIV');
    expect(screen.queryByRole('button', { name: 'Carregar mais achados' })).not.toBeInTheDocument();
  });

  it('mostra os skeletons existentes durante o carregamento', () => {
    vi.mocked(getFeed).mockReturnValue(new Promise(() => {}));
    renderHome();

    const region = screen.getByRole('region', { name: 'Feed de peças' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(within(region).getByRole('status')).toHaveTextContent('Carregando peças...');
    expect(region.querySelectorAll('[aria-hidden="true"]')).toHaveLength(6);
    expect(within(region).queryByRole('link')).not.toBeInTheDocument();
  });

  it('concatena a próxima página e oculta o botão ao alcançar o total', async () => {
    const user = userEvent.setup();
    let resolveNext!: (page: Paginated<Product>) => void;
    vi.mocked(getFeed)
      .mockResolvedValueOnce({ ...feed, total: 3 })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
      );
    renderHome();

    await screen.findByRole('link', { name: 'Vestido floral' });
    await user.click(screen.getByRole('button', { name: 'Carregar mais achados' }));
    expect(getFeed).toHaveBeenLastCalledWith({ page: 2 });
    expect(screen.getByRole('button', { name: 'Carregar mais achados' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Vestido floral' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jaqueta jeans' })).toBeInTheDocument();

    resolveNext({
      ...feed,
      items: [{ ...feed.items[0], id: '3', name: 'Camisa azul' }],
      page: 2,
      total: 3,
    });
    expect(await screen.findByRole('link', { name: 'Camisa azul' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vestido floral' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jaqueta jeans' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais achados' })).not.toBeInTheDocument();
  });

  it('navega para a rota existente do detalhe ao abrir uma peça', async () => {
    const user = userEvent.setup();
    vi.mocked(getFeed).mockResolvedValue(feed);
    renderHome();

    await user.click(await screen.findByRole('link', { name: 'Vestido floral' }));
    expect(screen.getByRole('heading', { name: 'Detalhe da peça' })).toBeInTheDocument();
  });
});
