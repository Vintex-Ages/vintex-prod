import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { AuthUser } from '@/types/auth';
import { AuthProvider } from './AuthContext';
import {
  AUTH_REFRESH_TOKEN_STORAGE_KEY,
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  useAuth,
} from './useAuth';
import { logout as authServiceLogout, refresh as authServiceRefresh } from '@/services/authService';
import { setSessionRefresher, type SessionRefresher } from '@/services/httpClient';

/**
 * Lado do `AuthProvider` na renovação de sessão (#275).
 *
 * O provider é o dono do refresh token: guarda, entrega à função que o
 * `httpClient` chama no 401, e troca o par quando o backend rotaciona. O
 * mecanismo do interceptor está em `services/httpClient.test.ts`; aqui se
 * testa o que o provider faz com o token.
 *
 * Arquivo separado de `AuthContext.test.tsx` de propósito: aquele espiona
 * `setSessionRefresher` junto com os outros ganchos do httpClient, e aqui
 * precisamos da função de renovação de verdade, para chamá-la.
 */

vi.mock('@/services/authService', () => ({
  logout: vi.fn().mockResolvedValue(undefined),
  me: vi.fn(),
  refresh: vi.fn(),
}));

const mockedLogout = vi.mocked(authServiceLogout);
const mockedRefresh = vi.mocked(authServiceRefresh);

const USUARIO: AuthUser = {
  id: 'u_1',
  name: 'Ana Brechó',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

vi.mock('@/services/httpClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/httpClient')>();
  return {
    ...actual,
    setAuthTokenProvider: vi.fn(),
    setOnAuthRequired: vi.fn(),
    setSessionRefresher: vi.fn(),
  };
});

/** Expõe estado e ações do contexto. */
function Sonda() {
  const { token, login, logout } = useAuth();

  return (
    <div>
      <span data-testid="token">{token ?? 'none'}</span>
      <button data-testid="entrar" onClick={() => login(USUARIO, 'tok-inicial', 'refresh-inicial')}>
        entrar
      </button>
      <button data-testid="sair" onClick={logout}>
        sair
      </button>
    </div>
  );
}

function montar() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Sonda />
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** A função que o provider registrou — é o contrato que o httpClient chama. */
function renovador(): SessionRefresher {
  const registrado = vi
    .mocked(setSessionRefresher)
    .mock.calls.map(([fn]) => fn)
    .filter((fn): fn is SessionRefresher => typeof fn === 'function')
    .at(-1);

  if (!registrado) throw new Error('o provider não registrou nenhum refresher');
  return registrado;
}

describe('AuthProvider — refresh token (#275)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    mockedLogout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    setSessionRefresher(null);
  });

  it('login guarda o refresh token no sessionStorage', async () => {
    montar();

    await act(async () => {
      screen.getByTestId('entrar').click();
    });

    expect(window.sessionStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBe('refresh-inicial');
  });

  it('logout apaga o refresh token e manda ele para o backend revogar', async () => {
    montar();

    await act(async () => {
      screen.getByTestId('entrar').click();
    });
    await act(async () => {
      screen.getByTestId('sair').click();
    });

    expect(window.sessionStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
    expect(mockedLogout).toHaveBeenCalledWith('refresh-inicial');
  });

  it('a renovação troca o access token e guarda o refresh rotacionado', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(USUARIO));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-velho');
    window.sessionStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'refresh-velho');

    montar();
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('tok-velho'));

    mockedRefresh.mockResolvedValue({
      user: USUARIO,
      access_token: 'tok-novo',
      refresh_token: 'refresh-novo',
    });

    let devolvido: string | null = null;
    await act(async () => {
      devolvido = await renovador()();
    });

    expect(devolvido).toBe('tok-novo');
    expect(mockedRefresh).toHaveBeenCalledWith('refresh-velho');
    // O backend rotaciona: guardar o novo e descartar o anterior.
    expect(window.sessionStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBe('refresh-novo');
    expect(window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('tok-novo');
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('tok-novo'));
  });

  it('duas renovações seguidas usam cada uma o token da anterior', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(USUARIO));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
    window.sessionStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'refresh-1');

    montar();
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('tok-1'));

    mockedRefresh
      .mockResolvedValueOnce({ user: USUARIO, access_token: 'tok-2', refresh_token: 'refresh-2' })
      .mockResolvedValueOnce({ user: USUARIO, access_token: 'tok-3', refresh_token: 'refresh-3' });

    await act(async () => {
      await renovador()();
    });
    await act(async () => {
      await renovador()();
    });

    // A segunda precisa usar `refresh-2`. Se o refresh vivesse em estado em vez
    // de ref, a closure da função registrada devolveria `refresh-1` de novo — e
    // o backend recusaria, porque a rotação já o invalidou.
    expect(mockedRefresh.mock.calls.map(([t]) => t)).toEqual(['refresh-1', 'refresh-2']);
    expect(window.sessionStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBe('refresh-3');
  });

  it('sem refresh guardado a renovação devolve null sem chamar o backend', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(USUARIO));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-velho');

    montar();
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('tok-velho'));

    await expect(renovador()()).resolves.toBeNull();
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it('renovação recusada devolve null e descarta o refresh morto', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(USUARIO));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-velho');
    window.sessionStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, 'refresh-expirado');

    montar();
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('tok-velho'));

    mockedRefresh.mockRejectedValue(new Error('refresh invalido'));

    await expect(renovador()()).resolves.toBeNull();
    // Descartado: a próxima requisição não tenta renovar com token morto.
    expect(window.sessionStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('sessão antiga, sem refresh no storage, continua válida', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(USUARIO));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-de-antes-do-275');

    montar();

    await waitFor(() =>
      expect(screen.getByTestId('token').textContent).toBe('tok-de-antes-do-275'),
    );
  });
});
