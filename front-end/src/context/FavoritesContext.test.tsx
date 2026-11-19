import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/useAuth';
import { useFavorites } from './useFavorites';
import type { AuthUser } from '@/types/auth';

vi.mock('@/services/favoriteService', () => ({
  listFavoriteIds: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));
import { addFavorite, listFavoriteIds, removeFavorite } from '@/services/favoriteService';
import { FavoritesProvider } from './FavoritesContext';

const mockedListIds = vi.mocked(listFavoriteIds);
const mockedAdd = vi.mocked(addFavorite);
const mockedRemove = vi.mocked(removeFavorite);

const USER: AuthUser = {
  id: 'u_1',
  name: 'Ana',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

let lastToggle: Promise<void> | null = null;

function Probe() {
  const { login, logout } = useAuth();
  const { ids, toggle, setFavorite, loading } = useFavorites();

  return (
    <div>
      <span data-testid="ids">{[...ids].sort().join(',') || 'vazio'}</span>
      <span data-testid="loading">{String(loading)}</span>
      <button onClick={() => login(USER, 'tok')}>entrar</button>
      <button onClick={() => logout()}>sair</button>
      <button
        onClick={() => {
          lastToggle = toggle('1').catch(() => undefined);
        }}
      >
        favoritar 1
      </button>
      <button
        onClick={() => {
          lastToggle = setFavorite('1', true).catch(() => undefined);
        }}
      >
        marcar 1
      </button>
      <button
        onClick={() => {
          lastToggle = setFavorite('1', false).catch(() => undefined);
        }}
      >
        desmarcar 1
      </button>
    </div>
  );
}

function renderApp() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <FavoritesProvider>
          <Probe />
        </FavoritesProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function entrar() {
  fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
}

describe('FavoritesContext', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    lastToggle = null;
    mockedListIds.mockResolvedValue(new Set());
    mockedAdd.mockResolvedValue();
    mockedRemove.mockResolvedValue();
  });

  it('anônimo: sem ids e sem chamar o service', async () => {
    renderApp();

    expect(screen.getByTestId('ids')).toHaveTextContent('vazio');
    expect(mockedListIds).not.toHaveBeenCalled();
  });

  it('ao logar, carrega os ids do usuário', async () => {
    mockedListIds.mockResolvedValue(new Set(['3', '5']));
    renderApp();

    await entrar();

    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('3,5'));
    expect(mockedListIds).toHaveBeenCalledWith(USER.id);
  });

  it('toggle duas vezes volta ao estado inicial (idempotência)', async () => {
    renderApp();
    await entrar();

    fireEvent.click(screen.getByRole('button', { name: 'favoritar 1' }));
    await act(() => lastToggle!);
    expect(screen.getByTestId('ids')).toHaveTextContent('1');
    expect(mockedAdd).toHaveBeenCalledWith(USER.id, '1');

    fireEvent.click(screen.getByRole('button', { name: 'favoritar 1' }));
    await act(() => lastToggle!);
    expect(screen.getByTestId('ids')).toHaveTextContent('vazio');
    expect(mockedRemove).toHaveBeenCalledWith(USER.id, '1');
  });

  it('é otimista: a peça aparece favoritada antes da resposta', async () => {
    let concluir!: () => void;
    mockedAdd.mockReturnValue(new Promise<void>((resolve) => (concluir = resolve)));
    renderApp();
    await entrar();

    fireEvent.click(screen.getByRole('button', { name: 'favoritar 1' }));

    expect(screen.getByTestId('ids')).toHaveTextContent('1');
    await act(async () => {
      concluir();
      await lastToggle;
    });
    expect(screen.getByTestId('ids')).toHaveTextContent('1');
  });

  it('falha da API desfaz o otimista e rejeita para a tela avisar', async () => {
    const erro = { code: 'API_ERROR', message: 'Falhou.' };
    mockedAdd.mockRejectedValue(erro);
    let rejeitado: unknown;
    function ProbeComErro() {
      const { toggle } = useFavorites();
      return (
        <button
          onClick={() => {
            lastToggle = toggle('9').catch((error: unknown) => {
              rejeitado = error;
            });
          }}
        >
          favoritar 9
        </button>
      );
    }
    render(
      <MemoryRouter>
        <AuthProvider>
          <FavoritesProvider>
            <Probe />
            <ProbeComErro />
          </FavoritesProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    await entrar();

    fireEvent.click(screen.getByRole('button', { name: 'favoritar 9' }));
    expect(screen.getByTestId('ids')).toHaveTextContent('9');
    await act(() => lastToggle!);

    expect(screen.getByTestId('ids')).toHaveTextContent('vazio');
    expect(rejeitado).toEqual(erro);
  });

  it('logout limpa os favoritos', async () => {
    mockedListIds.mockResolvedValue(new Set(['3']));
    renderApp();
    await entrar();
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('3'));

    fireEvent.click(screen.getByRole('button', { name: 'sair' }));

    expect(screen.getByTestId('ids')).toHaveTextContent('vazio');
  });

  it('sem sessão, toggle rejeita com AUTH_REQUIRED e não chama a API', async () => {
    let rejeitado: unknown;
    function ProbeAnonimo() {
      const { toggle } = useFavorites();
      return (
        <button
          onClick={() => {
            lastToggle = toggle('1').catch((error: unknown) => {
              rejeitado = error;
            });
          }}
        >
          anonimo
        </button>
      );
    }
    render(
      <MemoryRouter>
        <AuthProvider>
          <FavoritesProvider>
            <ProbeAnonimo />
          </FavoritesProvider>
        </AuthProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'anonimo' }));
    await act(() => lastToggle!);

    expect(rejeitado).toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(mockedAdd).not.toHaveBeenCalled();
  });

  it('useFavorites fora do provider lança um erro claro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Solto() {
      useFavorites();
      return null;
    }

    expect(() => render(<Solto />)).toThrow(
      'useFavorites deve ser utilizado dentro de FavoritesProvider',
    );
  });

  it('falha ao carregar os ids não quebra: fica vazio', async () => {
    mockedListIds.mockRejectedValue({ code: 'API_ERROR', message: 'x' });
    renderApp();

    await entrar();

    expect(screen.getByTestId('ids')).toHaveTextContent('vazio');
  });

  // Bug do #396: com `ids` vazio (carga falhou), "Remover" virava `PUT`.
  it('setFavorite(false) chama DELETE mesmo com ids vazio por falha na carga', async () => {
    mockedListIds.mockRejectedValue({ code: 'API_ERROR', message: 'x' });
    renderApp();
    await entrar();

    fireEvent.click(screen.getByRole('button', { name: 'desmarcar 1' }));
    await act(() => lastToggle!);

    expect(mockedRemove).toHaveBeenCalledWith(USER.id, '1');
    expect(mockedAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId('ids')).toHaveTextContent('vazio');
  });

  it('setFavorite(true) chama PUT mesmo se a peça já está em ids', async () => {
    mockedListIds.mockResolvedValue(new Set(['1']));
    renderApp();
    await entrar();
    await waitFor(() => expect(screen.getByTestId('ids')).toHaveTextContent('1'));

    fireEvent.click(screen.getByRole('button', { name: 'marcar 1' }));
    await act(() => lastToggle!);

    expect(mockedAdd).toHaveBeenCalledWith(USER.id, '1');
    expect(mockedRemove).not.toHaveBeenCalled();
    expect(screen.getByTestId('ids')).toHaveTextContent('1');
  });

  // Bug do #398: a ação retomada depois do login favorita enquanto a carga
  // corre; a lista do back, lida antes do PUT, não pode apagar o coração.
  it('escrita feita durante a carga sobrevive ao resultado da carga', async () => {
    let concluirCarga!: (ids: Set<string>) => void;
    mockedListIds.mockReturnValue(new Promise<Set<string>>((resolve) => (concluirCarga = resolve)));
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    fireEvent.click(screen.getByRole('button', { name: 'marcar 1' }));
    await act(() => lastToggle!);

    await act(async () => {
      concluirCarga(new Set(['3']));
    });

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('ids')).toHaveTextContent('1,3');
  });
});
