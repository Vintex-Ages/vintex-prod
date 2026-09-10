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
  return { ...actual, setAuthTokenProvider: vi.fn(), setOnAuthRequired: vi.fn() };
});

const SAMPLE_USER: AuthUser = {
  id: 'u_1',
  name: 'Ana Brechó',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

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

function PathProbe() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

/**
 * Executa `fn` engolindo o erro de render que o react-dom, em modo dev,
 * re-dispara como evento `error` no `window` (jsdom o imprimiria no stderr como
 * "uncaught"). Também silencia o `console.error` que o React emite junto.
 */
function withSuppressedRenderError(fn: () => void): void {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const swallow = (event: ErrorEvent) => event.preventDefault();
  window.addEventListener('error', swallow);
  try {
    fn();
  } finally {
    window.removeEventListener('error', swallow);
    errorSpy.mockRestore();
  }
}

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

  it('login atualiza o estado e persiste user + token no sessionStorage', async () => {
    renderApp();
    await settled();

    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));

    expect(screen.getByTestId('user')).toHaveTextContent('Ana Brechó');
    expect(screen.getByTestId('token')).toHaveTextContent('tok-1');
    expect(screen.getByTestId('auth')).toHaveTextContent('true');
    expect(window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('tok-1');
    expect(JSON.parse(window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY) ?? 'null')).toEqual(
      SAMPLE_USER,
    );
  });

  it('logout limpa o estado e o sessionStorage', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
    renderApp();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Ana Brechó'));

    fireEvent.click(screen.getByRole('button', { name: 'sair' }));

    expect(screen.getByTestId('user')).toHaveTextContent('anon');
    expect(screen.getByTestId('auth')).toHaveTextContent('false');
    expect(window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('restaura a sessão salva no sessionStorage ao montar o Provider', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-restored');

    renderApp();

    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'));
    expect(screen.getByTestId('user')).toHaveTextContent('Ana Brechó');
    expect(screen.getByTestId('token')).toHaveTextContent('tok-restored');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('useAuth() lança erro claro quando usado fora do AuthProvider', () => {
    withSuppressedRenderError(() => {
      expect(() => render(<Probe />)).toThrow(/useAuth.*<AuthProvider>/);
    });
  });

  it('o handler de 401 registrado no httpClient navega para /login e limpa a sessão', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(SAMPLE_USER));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok-1');
    window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, '/catalogo?q=jaqueta');
    renderApp(['/protegido']);
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'));

    const handler = vi.mocked(setOnAuthRequired).mock.calls.at(-1)?.[0];
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

  it('registra no httpClient um token provider que reflete o token atual', async () => {
    renderApp();
    await settled();

    fireEvent.click(screen.getByRole('button', { name: 'entrar' }));
    expect(vi.mocked(setAuthTokenProvider).mock.calls.at(-1)?.[0]?.()).toBe('tok-1');

    fireEvent.click(screen.getByRole('button', { name: 'sair' }));
    expect(vi.mocked(setAuthTokenProvider).mock.calls.at(-1)?.[0]?.()).toBeNull();
  });
});
