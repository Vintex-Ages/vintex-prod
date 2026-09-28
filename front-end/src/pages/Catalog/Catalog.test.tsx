import { act, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Catalog from './Catalog';
import { search } from '@/services/catalogService';
import type { SearchResult } from '@/types/product';

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
function renderCatalog(initialEntry = '/catalog') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
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

// Dublês de SearchResult para a UI, não fixtures reais do backend.
const mockResult: SearchResult = {
  match_type: 'exact',
  items: [
    { id: '1', name: 'Camiseta', price: 50, coverImageUrl: null, store: { id: '1', name: 'Loja' } },
  ],
  total: 1,
};

const latestResult: SearchResult = {
  ...mockResult,
  items: [{ ...mockResult.items[0], id: '2', name: 'Bota da consulta atual' }],
};

const fallbackResult: SearchResult = {
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
};

function deferredSearch() {
  let resolve!: (result: SearchResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<SearchResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function startNewSearchDuringRetry() {
  const retry = deferredSearch();
  const latest = deferredSearch();
  const user = userEvent.setup();
  vi.mocked(search)
    .mockRejectedValueOnce(new Error('rede fora'))
    .mockReturnValueOnce(retry.promise)
    .mockReturnValueOnce(latest.promise);
  renderCatalog('/catalog?q=camiseta');

  await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
  expect(search).toHaveBeenCalledTimes(2);
  // O filtro pode iniciar outra consulta mesmo com o submit da busca desabilitado.
  await user.click(screen.getByRole('button', { name: 'Calçados' }));
  expect(search).toHaveBeenCalledTimes(3);
  expect(search).toHaveBeenLastCalledWith(
    'camiseta',
    expect.objectContaining({ category: 'Sapatos' }),
  );
  return { retry, latest };
}

describe('Catalog', () => {
  beforeEach(() => {
    vi.mocked(search).mockReset();
  });

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
    vi.mocked(search).mockResolvedValue(fallbackResult);

    renderCatalog();

    expect(
      await screen.findByText('Nenhum resultado para "xyz". Veja outras peças disponíveis.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Bota Chelsea')).toBeInTheDocument();
    expect(screen.queryByText('Nada com essa combinação')).not.toBeInTheDocument();
    expect(screen.queryByText('Ainda não há peças por aqui')).not.toBeInTheDocument();
  });

  it('avisa quando a busca falha, em vez de deixar a promessa rejeitar sem tratamento', async () => {
    vi.mocked(search).mockRejectedValue(new Error('rede fora'));

    renderCatalog();

    // O erro virou um `ErrorState` com titulo e acao, em vez de um <p> solto.
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Não foi possível carregar as peças agora.');
    expect(within(alerta).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('esconde o erro anterior e mostra loading enquanto o retry está pendente', async () => {
    const retry = deferredSearch();
    const user = userEvent.setup();
    vi.mocked(search)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockReturnValueOnce(retry.promise);
    const { container } = renderCatalog();

    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(search).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Buscando' })).toBeDisabled();
    expect.soft(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect.soft(container.querySelector('.animate-pulse')).not.toBeNull();

    await act(async () => {
      retry.resolve(mockResult);
    });
  });

  it('retry reutiliza o termo e os filtros aplicados e recupera os resultados', async () => {
    const retry = deferredSearch();
    const user = userEvent.setup();
    vi.mocked(search)
      .mockResolvedValueOnce(mockResult)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockReturnValueOnce(retry.promise);
    renderCatalog('/catalog?q=camiseta');
    await screen.findByText('Camiseta');
    await user.click(screen.getByRole('button', { name: 'Roupas' }));
    await screen.findByRole('alert');
    expect(search).toHaveBeenLastCalledWith(
      'camiseta',
      expect.objectContaining({ category: 'Roupas' }),
    );
    const appliedFilters = vi.mocked(search).mock.calls[1][1];

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(search).toHaveBeenCalledTimes(3);
    expect(search).toHaveBeenLastCalledWith('camiseta', appliedFilters);
    await act(async () => {
      retry.resolve(mockResult);
    });
    expect(screen.getByText('Camiseta')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('resposta de retry antigo não substitui os produtos da consulta mais recente', async () => {
    const { retry, latest } = await startNewSearchDuringRetry();
    await act(async () => {
      latest.resolve(latestResult);
    });
    expect(screen.getByText('Bota da consulta atual')).toBeInTheDocument();

    await act(async () => {
      retry.resolve(mockResult);
    });
    expect.soft(screen.queryByText('Bota da consulta atual')).toBeInTheDocument();
    expect.soft(screen.queryByText('Camiseta')).not.toBeInTheDocument();
  });

  it('falha de retry antigo não instala erro sobre o sucesso da consulta mais recente', async () => {
    const { retry, latest } = await startNewSearchDuringRetry();
    await act(async () => {
      latest.resolve(latestResult);
    });
    expect(screen.getByText('Bota da consulta atual')).toBeInTheDocument();

    await act(async () => {
      retry.reject(new Error('falha atrasada'));
    });
    expect.soft(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect.soft(screen.queryByText('Bota da consulta atual')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Buscar' })[0]).toBeEnabled();
  });

  it.each(['sucesso', 'falha'] as const)(
    '%s de retry antigo não encerra o loading de uma consulta mais recente pendente',
    async (outcome) => {
      const { retry, latest } = await startNewSearchDuringRetry();
      expect(screen.getByRole('button', { name: 'Buscando' })).toBeDisabled();

      await act(async () => {
        if (outcome === 'sucesso') retry.resolve(mockResult);
        else retry.reject(new Error('falha atrasada'));
      });
      expect.soft(screen.queryByRole('button', { name: 'Buscando' })).toBeInTheDocument();
      expect.soft(screen.queryByText('Buscando peças…')).toBeInTheDocument();
      expect.soft(screen.queryByText('Camiseta')).not.toBeInTheDocument();

      await act(async () => {
        latest.resolve(latestResult);
      });
      expect(screen.getByText('Bota da consulta atual')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('esconde o motivo do fallback anterior enquanto uma nova busca está carregando', async () => {
    const next = deferredSearch();
    const user = userEvent.setup();
    vi.mocked(search).mockResolvedValueOnce(fallbackResult).mockReturnValueOnce(next.promise);
    renderCatalog('/catalog?q=xyz');
    await screen.findByText('Bota Chelsea');
    const reason = 'Nenhum resultado para "xyz". Veja outras peças disponíveis.';
    expect(screen.getByText(reason)).toBeInTheDocument();

    const [input] = screen.getAllByRole('searchbox');
    await user.clear(input);
    await user.type(input, 'camiseta{Enter}');
    expect(search).toHaveBeenLastCalledWith('camiseta', expect.any(Object));
    expect(screen.getByRole('button', { name: 'Buscando' })).toBeDisabled();
    expect.soft(screen.queryByText(reason)).not.toBeInTheDocument();

    await act(async () => {
      next.resolve(mockResult);
    });
    expect(screen.queryByText(reason)).not.toBeInTheDocument();
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
