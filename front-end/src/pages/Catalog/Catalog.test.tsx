import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Catalog from './Catalog';
import { search } from '@/services/catalogService';

/**
 * Fica no lugar da tela de chat de verdade: mostra a mensagem recebida via
 * `location.state`, confirmando tanto que a navegação aconteceu quanto que
 * ela levou o texto certo, sem precisar mockar `useNavigate` (#207).
 */
function VintexProbe() {
  const location = useLocation();
  const message = (location.state as { message?: string } | null)?.message;
  return <p>Vintex recebeu: {message}</p>;
}

/** A página navega para o detalhe, então precisa de contexto de router. */
function renderCatalog() {
  return render(
    <MemoryRouter initialEntries={['/catalog']}>
      <Routes>
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/product/:id" element={<h1>Detalhe da peça</h1>} />
        <Route path="/vintex" element={<VintexProbe />} />
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
      expect(screen.getByText('1 peça encontrada')).toBeInTheDocument();
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

    // #207: agora existem duas caixas de busca na tela (a tradicional e a
    // de dentro do spotlight, que só aparece no `web`). A primeira
    // (`getAllByRole(...)[0]`) é a tradicional do catálogo — antes bastava
    // `getByRole('searchbox')` porque só havia uma.
    const [input] = screen.getAllByRole('searchbox');
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

    // O erro virou um `ErrorState` com titulo e acao, em vez de um <p> solto.
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar as peças agora.');
    expect(within(alerta).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  // --- #207: pontos de entrada da Vintex ---

  it('renderiza o spotlight compacto acima dos filtros, além da busca tradicional', async () => {
    vi.mocked(search).mockResolvedValue(mockResult);

    renderCatalog();
    await waitFor(() => expect(search).toHaveBeenCalled());

    expect(
      screen.getByRole('heading', { name: 'Prefere descrever o que procura?' }),
    ).toBeInTheDocument();

    // As duas barras de busca (a tradicional e a de dentro do spotlight)
    // usam o mesmo aria-label "Buscar" hoje — débito técnico do SearchBar
    // (#93), fora do escopo desta issue.
    expect(screen.getAllByRole('searchbox')).toHaveLength(2);
  });

  it('enviar pelo spotlight leva para /vintex com a mensagem, não repete a busca tradicional', async () => {
    vi.mocked(search).mockResolvedValue(mockResult);
    const user = userEvent.setup();

    renderCatalog();
    await waitFor(() => expect(search).toHaveBeenCalled());
    vi.mocked(search).mockClear();

    const [, spotlightInput] = screen.getAllByRole('searchbox');
    await user.type(spotlightInput, 'vestido floral{Enter}');

    expect(await screen.findByText('Vintex recebeu: vestido floral')).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });
});