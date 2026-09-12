import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Catalog from './Catalog';
import type { SearchResult } from '@/types/product';

vi.mock('@/services/catalogService', () => ({ search: vi.fn() }));
import { search } from '@/services/catalogService';

const mockedSearch = vi.mocked(search);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderCatalog() {
  return render(
    <MemoryRouter initialEntries={['/catalog']}>
      <Routes>
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/product/:id" element={<p>Detalhe do produto</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const EXACT_RESULT: SearchResult = {
  match_type: 'exact',
  items: [
    {
      id: '1',
      name: 'Jaqueta de Couro',
      price: 189,
      coverImageUrl: null,
      store: { id: '1', name: 'Brechó da Redenção' },
    },
  ],
  total: 1,
};

const FALLBACK_RESULT: SearchResult = {
  match_type: 'fallback',
  items: [],
  suggestions: {
    reason: 'Nenhum resultado para "jaqueta xyz". Veja outras peças disponíveis.',
    items: [
      {
        id: '2',
        name: 'Bota Chelsea',
        price: 259,
        coverImageUrl: null,
        store: { id: '2', name: 'Brechó da Redenção' },
      },
    ],
  },
  total: 0,
};

describe('<Catalog />', () => {
  it('busca envia o termo digitado', async () => {
    mockedSearch.mockResolvedValue(EXACT_RESULT);
    const user = userEvent.setup();
    renderCatalog();

    await user.type(screen.getByRole('textbox', { name: 'Buscar' }), 'jaqueta');
    await user.click(screen.getByRole('button', { name: 'Enviar busca' }));

    await waitFor(() => expect(mockedSearch).toHaveBeenCalledWith('jaqueta', {}));
  });

  it('match_type "exact": renderiza os itens normalmente', async () => {
    mockedSearch.mockResolvedValue(EXACT_RESULT);
    const user = userEvent.setup();
    renderCatalog();

    await user.type(screen.getByRole('textbox', { name: 'Buscar' }), 'jaqueta');
    await user.click(screen.getByRole('button', { name: 'Enviar busca' }));

    expect(await screen.findByText('Jaqueta de Couro')).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum resultado/)).not.toBeInTheDocument();
  });

  it('match_type "fallback": renderiza suggestions.items no grid junto com o motivo, nunca "nenhum resultado"', async () => {
    mockedSearch.mockResolvedValue(FALLBACK_RESULT);
    const user = userEvent.setup();
    renderCatalog();

    await user.type(screen.getByRole('textbox', { name: 'Buscar' }), 'jaqueta xyz');
    await user.click(screen.getByRole('button', { name: 'Enviar busca' }));

    expect(
      await screen.findByText('Nenhum resultado para "jaqueta xyz". Veja outras peças disponíveis.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Bota Chelsea')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma peça encontrada no momento.')).not.toBeInTheDocument();
  });
});
