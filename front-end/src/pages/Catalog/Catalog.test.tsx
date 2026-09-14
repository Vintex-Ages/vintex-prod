import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Catalog from './Catalog';
import { search } from '@/services/catalogService';

/** A página navega para o detalhe, então precisa de contexto de router. */
function renderCatalog() {
  return render(
    <MemoryRouter initialEntries={['/catalog']}>
      <Routes>
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/product/:id" element={<h1>Detalhe da peça</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

vi.mock('@/services/catalogService', () => ({
  search: vi.fn(),
}));

const mockResult = {
  match_type: 'exact' as const,
  items: [
    { id: '1', name: 'Camiseta', price: 50, coverImageUrl: null, store: { id: '1', name: 'Loja' } },
  ],
  total: 1,
};

describe('Catalog', () => {
  it('busca produtos ao montar e mostra a contagem', async () => {
    vi.mocked(search).mockResolvedValue(mockResult);

    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Camiseta')).toBeInTheDocument();
      expect(screen.getByText('1 resultado(s)')).toBeInTheDocument();
    });

    expect(search).toHaveBeenCalledWith('', {});
  });

  it('buscar combina o termo com os filtros ativos, sem descartá-los', async () => {
    vi.mocked(search).mockResolvedValue(mockResult);
    const user = userEvent.setup();

    renderCatalog();
    await waitFor(() => expect(search).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Roupas' }));

    await waitFor(() => {
      expect(search).toHaveBeenLastCalledWith('', expect.objectContaining({ category: 'Roupas' }));
    });

    const input = screen.getByRole('textbox');
    await user.type(input, 'camiseta{Enter}');

    await waitFor(() => {
      expect(search).toHaveBeenLastCalledWith(
        'camiseta',
        expect.objectContaining({ category: 'Roupas' }),
      );
    });
  });
  it('match_type "fallback": mostra o motivo e as sugestões no grid, nunca tela vazia', async () => {
    vi.mocked(search).mockResolvedValue({
      match_type: 'fallback',
      items: [],
      total: 0,
      suggestions: {
        reason: 'Nenhum resultado para "xyz". Veja outras peças disponíveis.',
        items: [
          {
            id: '9',
            name: 'Bota Chelsea',
            price: 259,
            coverImageUrl: null,
            store: { id: '2', name: 'Brechó' },
          },
        ],
      },
    });

    renderCatalog();

    expect(
      await screen.findByText('Nenhum resultado para "xyz". Veja outras peças disponíveis.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Bota Chelsea')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma peça encontrada no momento.')).not.toBeInTheDocument();
  });

  it('avisa quando a busca falha, em vez de deixar a promessa rejeitar sem tratamento', async () => {
    vi.mocked(search).mockRejectedValue(new Error('rede fora'));

    renderCatalog();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os produtos.',
    );
  });
});
