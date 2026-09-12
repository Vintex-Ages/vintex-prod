import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { AuthUser } from '@/types/auth';
import { AuthProvider } from './AuthContext';
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY, useAuth } from './useAuth';
import {
  REDIRECT_STORAGE_KEY,
  setAuthTokenProvider,
  setOnAuthRequired,
} from '@/services/httpClient';

// Só as integrações com o httpClient são espionadas; o resto do módulo é real.
vi.mock('@/services/httpClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/httpClient')>();

  return {
    ...actual,
    setAuthTokenProvider: vi.fn(),
    setOnAuthRequired: vi.fn(),
  };
});

const SAMPLE_USER: AuthUser = {
  id: 'u_1',
  name: 'Ana Brechó',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

/**
 * Componente auxiliar que expõe o estado do AuthContext durante os testes.
 */
function Probe() {
  const { user, token, isAuthenticated, loading, login, logout } = useAuth();

  return (
    <div>
      <span data-testid="user">{user?.name ?? 'anon'}</span>

      <span data-testid="token">{token ?? 'none'}</span>

      <span data-testid="auth">{String(isAuthenticated)}</span>

      <span data-testid="loading">{String(loading)}</span>

      <button onClick={() => login(SAMPLE_USER, 'tok-1')}>entrar</button>

      <button onClick={() => logout()}>sair</button>
    </div>
  );
}

/**
 * Expõe pathname + query string para verificar os redirecionamentos
 * realizados pelo AuthProvider.
 */
function PathProbe() {
  const location = useLocation();

  return <span data-testid="path">{location.pathname + location.search}</span>;
}

/**
 * Executa `fn` engolindo o erro de render que o react-dom, em modo dev,
 * re-dispara como evento `error` no `window`.
 *
 * Também silencia o `console.error` emitido pelo React nesse cenário.
 */
function withSuppressedRenderError(fn: () => void): void {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  const swallow = (event: ErrorEvent) => {
    event.preventDefault();
  };

  window.addEventListener('error', swallow);

  try {
    fn();
  } finally {
    window.removeEventListener('error', swallow);
    errorSpy.mockRestore();
  }
}

/**
 * Renderiza o AuthProvider dentro de um Router controlado.
 */
function renderApp(entries: string[] = ['/protegido']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <AuthProvider>
        <PathProbe />
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const settled = () =>
  waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

describe('AuthContext', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * O login deve atualizar o contexto e persistir os dados necessários
   * para restaurar a sessão dentro da mesma aba.
   */
  it('login atualiza o estado e persiste user + token no sessionStorage', async () => {
    renderApp();

    await settled();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'entrar',
      }),
    );

    expect(screen.getByTestId('user')).toHaveTextContent('Ana Brechó');

    expect(screen.getByTestId('token')).toHaveTextContent('tok-1');

    expect(screen.getByTestId('auth')).toHaveTextContent('true');

    expect(window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('tok-1');

    expect(JSON.parse(window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY) ?? 'null')).toEqual(
      SAMPLE_USER,
    );
  });

  /**
   * Quando uma ação protegida iniciou o fluxo de autenticação,
   * o login deve devolver o usuário exatamente à rota salva.
   *
   * A chave de redirecionamento é consumida depois do login para não
   * interferir em autenticações futuras.
   */
  it('após login retorna à origem salva pela ação protegida', async () => {
    window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, '/catalog?category=roupas');

    renderApp(['/login']);

    await settled();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'entrar',
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent('/catalog?category=roupas'),
    );

    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBeNull();

    expect(screen.getByTestId('auth')).toHaveTextContent('true');
  });

  /**
   * Sem uma origem interrompida, o login segue para a Home.
   */
  it('após login vai para a home quando não existe origem salva', async () => {
    renderApp(['/login']);

    await settled();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'entrar',
      }),
    );

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/'));
  });

  /**
   * Logout deve remover os dados persistidos e refletir imediatamente
   * o estado anônimo no contexto.
   */
  it('logout limpa o estado e o sessionStorage', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));

    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');

    renderApp();

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Ana Brechó'));

    fireEvent.click(
      screen.getByRole('button', {
        name: 'sair',
      }),
    );

    expect(screen.getByTestId('user')).toHaveTextContent('anon');

    expect(screen.getByTestId('auth')).toHaveTextContent('false');

    expect(window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY)).toBeNull();

    expect(window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  /**
   * Uma sessão válida persistida anteriormente deve ser restaurada
   * quando o Provider é montado.
   */
  it('restaura a sessão salva no sessionStorage ao montar o Provider', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));

    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-restored');

    renderApp();

    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'));

    expect(screen.getByTestId('user')).toHaveTextContent('Ana Brechó');

    expect(screen.getByTestId('token')).toHaveTextContent('tok-restored');

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  /**
   * useAuth precisa falhar de maneira clara quando não existe
   * AuthProvider acima do componente consumidor.
   */
  it('useAuth() lança erro claro quando usado fora do AuthProvider', () => {
    withSuppressedRenderError(() => {
      expect(() => render(<Probe />)).toThrow(/useAuth.*<AuthProvider>/);
    });
  });

  /**
   * Um 401 AUTH_REQUIRED deve invalidar a sessão e encaminhar para login,
   * mantendo a origem registrada pelo httpClient.
   */
  it('o handler de 401 registrado no httpClient navega para /login e limpa a sessão', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));

    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');

    window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, '/catalogo?q=jaqueta');

    renderApp(['/protegido']);

    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'));

    const authRequiredCalls = vi.mocked(setOnAuthRequired).mock.calls;

    const handler = authRequiredCalls[authRequiredCalls.length - 1]?.[0];

    expect(handler).toBeInstanceOf(Function);

    act(() => {
      handler?.('/protegido');
    });

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/login'));

    expect(screen.getByTestId('user')).toHaveTextContent('anon');

    expect(screen.getByTestId('auth')).toHaveTextContent('false');

    expect(window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY)).toBeNull();

    expect(window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  /**
   * O provider de token registrado no httpClient deve sempre refletir
   * a sessão atual.
   */
  it('registra no httpClient um token provider que reflete o token atual', async () => {
    renderApp();

    await settled();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'entrar',
      }),
    );

    const loginTokenProviderCalls = vi.mocked(setAuthTokenProvider).mock.calls;

    expect(loginTokenProviderCalls[loginTokenProviderCalls.length - 1]?.[0]?.()).toBe('tok-1');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'sair',
      }),
    );

    const logoutTokenProviderCalls = vi.mocked(setAuthTokenProvider).mock.calls;

    expect(logoutTokenProviderCalls[logoutTokenProviderCalls.length - 1]?.[0]?.()).toBeNull();
  });
});
