import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { REDIRECT_STORAGE_KEY } from '@/services/httpClient';
import { PENDING_ACTION_STORAGE_KEY, useProtectedAction } from './useProtectedAction';

const authenticatedContext: AuthContextValue = {
  user: {
    id: 'u_1',
    name: 'Ana Brechó',
    email: 'ana@exemplo.com',
  },
  token: 'tok-123',
  isAuthenticated: true,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
};

const anonymousContext: AuthContextValue = {
  user: null,
  token: null,
  isAuthenticated: false,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
};

/**
 * Cria o ambiente mínimo necessário para testar o hook.
 *
 * O MemoryRouter fornece a rota atual e a navegação, enquanto o AuthContext
 * permite controlar o estado de autenticação em cada cenário.
 */
function createWrapper(authValue: AuthContextValue, initialEntry = '/catalog?category=roupas') {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
      </MemoryRouter>
    );
  };
}

describe('useProtectedAction', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  /**
   * Critério principal da FE-US001-2:
   *
   * Ao iniciar uma ação protegida sem autenticação, a ação não é executada.
   * A origem e a intenção são preservadas para retomada posterior e a
   * barreira de autenticação é aberta.
   */
  it('guarda origem e intenção e abre a barreira quando o usuário está deslogado', async () => {
    const action = vi.fn();

    const { result } = renderHook(
      () =>
        useProtectedAction({
          intent: {
            type: 'favorite',
            payload: {
              productId: '123',
            },
          },
          action,
        }),
      {
        wrapper: createWrapper(anonymousContext, '/catalog?category=roupas'),
      },
    );

    await act(async () => {
      await result.current.runProtectedAction();
    });

    expect(action).not.toHaveBeenCalled();
    expect(result.current.interceptorOpen).toBe(true);

    expect(JSON.parse(window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY) ?? 'null')).toEqual(
      {
        returnTo: '/catalog?category=roupas',
        intent: {
          type: 'favorite',
          payload: {
            productId: '123',
          },
        },
      },
    );

    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe('/catalog?category=roupas');
  });

  /**
   * Com sessão ativa, a ação protegida deve acontecer imediatamente.
   *
   * A intenção é preservada apenas durante a execução para cobrir o caso
   * de uma sessão expirada. Depois de sucesso, os dados pendentes são limpos.
   */
  it('executa a ação imediatamente quando o usuário está autenticado', async () => {
    const action = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useProtectedAction({
          intent: {
            type: 'favorite',
            payload: {
              productId: '123',
            },
          },
          action,
        }),
      {
        wrapper: createWrapper(authenticatedContext),
      },
    );

    await act(async () => {
      await result.current.runProtectedAction();
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.interceptorOpen).toBe(false);

    expect(window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY)).toBeNull();

    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBeNull();
  });

  /**
   * Uma sessão pode existir no frontend e já estar inválida no backend.
   *
   * Se a ação responder com `401 AUTH_REQUIRED`, a intenção precisa continuar
   * armazenada para poder ser retomada depois que o login for concluído.
   */
  it('mantém origem e intenção quando uma sessão autenticada recebe AUTH_REQUIRED', async () => {
    const action = vi.fn().mockRejectedValue({
      response: {
        status: 401,
        data: {
          error: {
            code: 'AUTH_REQUIRED',
            message: 'É necessário entrar ou criar conta para esta ação.',
            return_to: '/catalog?category=roupas',
          },
        },
      },
    });

    const { result } = renderHook(
      () =>
        useProtectedAction({
          intent: {
            type: 'favorite',
            payload: {
              productId: '123',
            },
          },
          action,
        }),
      {
        wrapper: createWrapper(authenticatedContext, '/catalog?category=roupas'),
      },
    );

    await act(async () => {
      await result.current.runProtectedAction();
    });

    expect(action).toHaveBeenCalledTimes(1);

    expect(JSON.parse(window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY) ?? 'null')).toEqual(
      {
        returnTo: '/catalog?category=roupas',
        intent: {
          type: 'favorite',
          payload: {
            productId: '123',
          },
        },
      },
    );

    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe('/catalog?category=roupas');
  });

  /**
   * A opção "Agora não" representa o cancelamento do fluxo.
   *
   * A barreira é fechada e tanto a intenção quanto a origem são removidas
   * para impedir uma retomada inesperada em uma autenticação futura.
   */
  it('cancela a ação pendente quando o usuário dispensa o interceptor', async () => {
    const action = vi.fn();

    const { result } = renderHook(
      () =>
        useProtectedAction({
          intent: {
            type: 'favorite',
            payload: {
              productId: '123',
            },
          },
          action,
        }),
      {
        wrapper: createWrapper(anonymousContext),
      },
    );

    await act(async () => {
      await result.current.runProtectedAction();
    });

    expect(result.current.interceptorOpen).toBe(true);
    expect(action).not.toHaveBeenCalled();

    expect(window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY)).not.toBeNull();

    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).not.toBeNull();

    act(() => {
      result.current.dismissInterceptor();
    });

    expect(result.current.interceptorOpen).toBe(false);
    expect(action).not.toHaveBeenCalled();

    expect(window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY)).toBeNull();

    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBeNull();
  });

  /**
   * Segundo critério principal da FE-US001-2:
   *
   * Quando o usuário retorna autenticado à mesma origem, o hook identifica
   * a intenção pendente e tenta executar novamente a ação correspondente.
   *
   * Após sucesso, os dados usados para retomada são removidos.
   */
  it('retoma a ação pendente quando o usuário volta autenticado à origem', async () => {
    const action = vi.fn().mockResolvedValue(undefined);

    window.sessionStorage.setItem(
      PENDING_ACTION_STORAGE_KEY,
      JSON.stringify({
        returnTo: '/catalog?category=roupas',
        intent: {
          type: 'favorite',
          payload: {
            productId: '123',
          },
        },
      }),
    );

    window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, '/catalog?category=roupas');

    renderHook(
      () =>
        useProtectedAction({
          intent: {
            type: 'favorite',
            payload: {
              productId: '123',
            },
          },
          action,
        }),
      {
        wrapper: createWrapper(authenticatedContext, '/catalog?category=roupas'),
      },
    );

    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });

    expect(window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY)).toBeNull();

    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBeNull();
  });

  /**
   * Uma ação pendente pertencente a outra rota não deve ser executada.
   */
  it('não retoma a ação quando a origem armazenada é diferente da rota atual', async () => {
    const action = vi.fn();

    window.sessionStorage.setItem(
      PENDING_ACTION_STORAGE_KEY,
      JSON.stringify({
        returnTo: '/product?id=10',
        intent: {
          type: 'favorite',
          payload: {
            productId: '123',
          },
        },
      }),
    );

    renderHook(
      () =>
        useProtectedAction({
          intent: {
            type: 'favorite',
            payload: {
              productId: '123',
            },
          },
          action,
        }),
      {
        wrapper: createWrapper(authenticatedContext, '/catalog?category=roupas'),
      },
    );

    await waitFor(() => {
      expect(action).not.toHaveBeenCalled();
    });

    expect(window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY)).not.toBeNull();
  });

  /**
   * Apenas o hook que representa a mesma intenção pode retomar a ação.
   */
  it('não retoma a ação quando a intenção armazenada é diferente', async () => {
    const action = vi.fn();

    window.sessionStorage.setItem(
      PENDING_ACTION_STORAGE_KEY,
      JSON.stringify({
        returnTo: '/catalog?category=roupas',
        intent: {
          type: 'follow-store',
          payload: {
            storeId: '7',
          },
        },
      }),
    );

    renderHook(
      () =>
        useProtectedAction({
          intent: {
            type: 'favorite',
            payload: {
              productId: '123',
            },
          },
          action,
        }),
      {
        wrapper: createWrapper(authenticatedContext, '/catalog?category=roupas'),
      },
    );

    await waitFor(() => {
      expect(action).not.toHaveBeenCalled();
    });

    expect(window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY)).not.toBeNull();
  });

  /**
   * Ao escolher entrar, a barreira fecha e o usuário segue para login.
   * A rota de origem é preservada no state da navegação.
   */
  it('navega para login preservando a rota de origem', async () => {
    const action = vi.fn();

    const { result } = renderHook(
      () => {
        const protectedAction = useProtectedAction({
          intent: {
            type: 'favorite',
            payload: {
              productId: '123',
            },
          },
          action,
        });

        const location = useLocation();

        return {
          protectedAction,
          location,
        };
      },
      {
        wrapper: createWrapper(anonymousContext, '/catalog?category=roupas'),
      },
    );

    await act(async () => {
      await result.current.protectedAction.runProtectedAction();
    });

    expect(result.current.protectedAction.interceptorOpen).toBe(true);

    act(() => {
      result.current.protectedAction.goToLogin();
    });

    expect(result.current.location.pathname).toBe('/login');

    expect(result.current.location.state).toEqual({
      from: '/catalog?category=roupas',
    });

    expect(result.current.protectedAction.interceptorOpen).toBe(false);
  });

  /**
   * O cadastro segue o mesmo princípio do login:
   * mantém a origem para que o fluxo possa ser retomado posteriormente.
   */
  it('navega para cadastro preservando a rota de origem', async () => {
    const action = vi.fn();

    const { result } = renderHook(
      () => {
        const protectedAction = useProtectedAction({
          intent: {
            type: 'favorite',
            payload: {
              productId: '123',
            },
          },
          action,
        });

        const location = useLocation();

        return {
          protectedAction,
          location,
        };
      },
      {
        wrapper: createWrapper(anonymousContext, '/product?id=10'),
      },
    );

    await act(async () => {
      await result.current.protectedAction.runProtectedAction();
    });

    act(() => {
      result.current.protectedAction.goToRegister();
    });

    expect(result.current.location.pathname).toBe('/register');

    expect(result.current.location.state).toEqual({
      from: '/product?id=10',
    });

    expect(result.current.protectedAction.interceptorOpen).toBe(false);
  });
});
