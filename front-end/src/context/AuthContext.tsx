import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { paths } from '@/routes/paths';
import {
  logout as authServiceLogout,
  me,
  refresh as authServiceRefresh,
} from '@/services/authService';
import {
  REDIRECT_STORAGE_KEY,
  setAuthTokenProvider,
  setOnAuthRequired,
  setSessionRefresher,
  type RefreshResult,
} from '@/services/httpClient';
import { AUTH_REQUIRED, type AuthUser } from '@/types/auth';
import {
  AUTH_REFRESH_TOKEN_STORAGE_KEY,
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  AuthContext,
  type AuthContextValue,
} from './useAuth';

/**
 * Provider de autenticação (FE-FND-2, parte 3).
 *
 * Mantém `user` e `token` em estado React e espelhados em `sessionStorage`,
 * além de conectar o ciclo da sessão ao `httpClient`.
 *
 * Responsabilidades:
 * - restaurar a sessão persistida ao montar;
 * - disponibilizar login e logout para o restante da aplicação;
 * - fornecer o token atual ao `httpClient`;
 * - renovar a sessão com o refresh token, a pedido do `httpClient` (#275);
 * - tratar respostas `401 AUTH_REQUIRED`;
 * - retornar à rota de origem depois de uma autenticação concluída.
 *
 * O fluxo de retorno é compartilhado com ações protegidas:
 * `REDIRECT_STORAGE_KEY` guarda a página em que a autenticação foi exigida.
 *
 * Usage:
 *   import { AuthProvider } from '@/context/AuthContext';
 *   import { useAuth } from '@/context/useAuth';
 *
 *   function App() {
 *     return (
 *       <BrowserRouter>
 *         <AuthProvider>
 *           <AppRoutes />
 *         </AuthProvider>
 *       </BrowserRouter>
 *     );
 *   }
 *
 *   function Header() {
 *     const { user, isAuthenticated, logout } = useAuth();
 *
 *     return isAuthenticated
 *       ? <button onClick={logout}>Sair de {user?.name}</button>
 *       : null;
 *   }
 */

/**
 * Rota padrão usada quando o login é concluído sem existir
 * uma origem pendente.
 */
const DEFAULT_AFTER_LOGIN_PATH = '/';

/**
 * O backend recusou o refresh token, e não apenas deixou de responder.
 *
 * `AUTH_REQUIRED` é o código que `app/core/errors.py::Unauthorized` usa; um
 * `TOKEN_*` cobre um código mais específico que o backend venha a devolver.
 * Qualquer outra coisa — inclusive erro sem `response`, que o `toApiError` do
 * `authService` mapeia para `API_ERROR` — não é afirmação sobre a sessão.
 */
function recusaDeSessao(erro: unknown): boolean {
  const code = (erro as { code?: unknown } | null)?.code;
  return typeof code === 'string' && (code === AUTH_REQUIRED || code.startsWith('TOKEN_'));
}

/**
 * Lê e valida a sessão persistida.
 *
 * Retorna `null` quando os dados não existem ou estão corrompidos.
 */
function readStoredSession(): {
  user: AuthUser;
  token: string;
  refreshToken: string | null;
} | null {
  try {
    const rawUser = window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY);

    const token = window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);

    if (!rawUser || !token) {
      return null;
    }

    return {
      user: JSON.parse(rawUser) as AuthUser,
      token,
      // Sessão aberta antes do #275 não tem refresh guardado: ela continua
      // válida e apenas não se renova.
      refreshToken: window.sessionStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY),
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Refresh token atual, em ref e não em estado.
   *
   * Quem lê é a função de renovação registrada no `httpClient`, registrada uma
   * vez. Em estado, ela leria pela closure o valor do render em que foi
   * registrada — o token anterior, já invalidado pela rotação que o backend
   * faz a cada renovação.
   */
  const refreshTokenRef = useRef<string | null>(null);

  /**
   * Conta quantas sessões já foram encerradas nesta montagem.
   *
   * Uma renovação em curso quando o usuário sai chegava depois do `logout` e
   * regravava o par que ele tinha acabado de apagar, ressuscitando a sessão com
   * o usuário já mandado ao login. O refresher guarda o valor no começo e só
   * grava se ele não mudou no meio.
   */
  const sessaoRef = useRef(0);

  const guardarRefreshToken = useCallback((proximo: string | null) => {
    refreshTokenRef.current = proximo;
    try {
      if (proximo) {
        window.sessionStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, proximo);
      } else {
        window.sessionStorage.removeItem(AUTH_REFRESH_TOKEN_STORAGE_KEY);
      }
    } catch {
      // Storage indisponível: renovação segue possível nesta aba, em memória.
    }
  }, []);

  /**
   * Registra uma sessão autenticada.
   *
   * Depois de persistir os dados da sessão, verifica se existe uma rota de
   * origem armazenada por uma ação protegida. Quando existe, volta para ela.
   *
   * Ao montar novamente a página de origem, `useProtectedAction` poderá
   * reconhecer a intenção pendente e retomar a ação correspondente.
   */
  const login = useCallback(
    (nextUser: AuthUser, nextToken: string, nextRefreshToken?: string | null) => {
      let redirectTo = DEFAULT_AFTER_LOGIN_PATH;

      guardarRefreshToken(nextRefreshToken ?? null);

      try {
        window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));

        window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, nextToken);

        redirectTo =
          window.sessionStorage.getItem(REDIRECT_STORAGE_KEY) ?? DEFAULT_AFTER_LOGIN_PATH;

        window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
      } catch {
        // Storage indisponível: sessão permanece válida somente em memória.
      }

      setUser(nextUser);
      setToken(nextToken);

      navigate(redirectTo, {
        replace: true,
      });
    },
    [navigate, guardarRefreshToken],
  );

  /**
   * Encerra a sessão atual e remove os dados persistidos.
   *
   * A limpeza local (storage + estado) é síncrona e imediata: o usuário não
   * espera a resposta do backend para sair da UI autenticada. A chamada a
   * `authServiceLogout()` é disparada em paralelo, em modo "melhor esforço" —
   * se o backend falhar (rede indisponível, token já expirado etc.), o
   * usuário permanece deslogado localmente mesmo assim, sem ficar "preso" na
   * UI à espera dessa chamada.
   */
  const logout = useCallback(() => {
    // Invalida qualquer renovação em curso: a resposta dela não grava mais nada.
    sessaoRef.current += 1;

    // Lido antes de limpar: é o que o backend precisa para revogar a sessão.
    const refreshToken = refreshTokenRef.current;

    try {
      window.sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);

      window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // Nada a fazer quando o storage está indisponível.
    }

    guardarRefreshToken(null);

    setUser(null);
    setToken(null);

    void authServiceLogout(refreshToken).catch(() => {
      // Melhor esforço: falha no backend não deve impedir o logout local.
    });
  }, [guardarRefreshToken]);

  /**
   * Rebusca o usuário atual no backend e atualiza estado + `sessionStorage`
   * sem exigir um novo login (ex.: depois de criar uma loja, `is_seller`
   * passa a `true`).
   */
  const refreshUser = useCallback(async () => {
    const nextUser = await me();
    // Resposta sem usuário não derruba a sessão: quem confirma o papel não
    // pode ser quem desloga por acidente.
    if (!nextUser) return;

    setUser(nextUser);
    try {
      window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));
    } catch {
      // Sem storage disponível: usuário atualizado fica só em memória.
    }
  }, []);

  /**
   * Restaura uma sessão previamente persistida.
   */
  useEffect(() => {
    const stored = readStoredSession();

    if (stored) {
      setUser(stored.user);
      setToken(stored.token);
      refreshTokenRef.current = stored.refreshToken;
    }

    setLoading(false);
  }, []);

  /**
   * Mantém o httpClient sincronizado com o token atual.
   */
  useEffect(() => {
    setAuthTokenProvider(() => token);
  }, [token]);

  /**
   * Confirma o papel do usuário assim que existe token.
   *
   * O `POST /auth/login` não devolve `is_seller`: no back, `UserPublic` é
   * identidade mais `created_at`, e por isso `apiLogin` entrega o usuário com
   * `is_seller: false` fixo. Quem sabe o papel é o `GET /users/me`. Sem esta
   * confirmação um vendedor de verdade nunca passa pela guarda de `/seller`,
   * por mais que o banco diga o contrário — foi o que apareceu no primeiro
   * teste de integração com a API real.
   *
   * Declarado depois do efeito acima de propósito: efeitos rodam na ordem em
   * que aparecem, e a chamada precisa do token já registrado no `httpClient`.
   */
  useEffect(() => {
    if (!token) return;

    void refreshUser().catch(() => {
      // 401 já é tratado pelo interceptador do `httpClient`. Outra falha
      // mantém o usuário que o login entregou, sem derrubar a sessão.
    });
  }, [token, refreshUser]);

  /**
   * Renova a sessão quando o `httpClient` toma um `401 AUTH_REQUIRED` (#275).
   *
   * Devolve `sessao-encerrada` quando não há refresh guardado ou o backend
   * recusou o que havia — e aí o interceptor segue para o login, como fazia
   * antes deste efeito existir. `falha-transitoria` quando não houve resposta:
   * a sessão fica de pé e só aquela requisição falha.
   *
   * O backend rotaciona o refresh a cada renovação, então o par novo é guardado
   * antes de a promessa resolver.
   */
  useEffect(() => {
    setSessionRefresher(async (): Promise<RefreshResult> => {
      const atual = refreshTokenRef.current;
      if (!atual) return { estado: 'sessao-encerrada' };

      const sessao = sessaoRef.current;

      try {
        const renovada = await authServiceRefresh(atual);

        // Saiu no meio: a resposta não regrava o que o `logout` apagou.
        if (sessao !== sessaoRef.current) return { estado: 'sessao-encerrada' };

        guardarRefreshToken(renovada.refresh_token);

        try {
          window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, renovada.access_token);
        } catch {
          // Sem storage: a sessão renovada vive nesta aba, em memória.
        }

        setToken(renovada.access_token);
        return { estado: 'renovada', token: renovada.access_token };
      } catch (erro) {
        if (sessao !== sessaoRef.current) return { estado: 'sessao-encerrada' };

        // Só recusa identificável mata o refresh token. Rede fora, timeout,
        // CORS e 5xx chegam aqui como `API_ERROR` e não dizem nada sobre a
        // sessão: apagar o token neles forçava login por um blip.
        if (recusaDeSessao(erro)) {
          guardarRefreshToken(null);
          return { estado: 'sessao-encerrada' };
        }

        return { estado: 'falha-transitoria' };
      }
    });

    return () => setSessionRefresher(null);
  }, [guardarRefreshToken]);

  /**
   * Remove o provider de token quando o AuthProvider desmonta.
   */
  useEffect(() => () => setAuthTokenProvider(() => null), []);

  /**
   * Trata `401 AUTH_REQUIRED` disparado pelo httpClient.
   *
   * A origem preferida é aquela salva pelo próprio cliente HTTP.
   * O usuário é deslogado e enviado ao login mantendo essa origem.
   */
  useEffect(() => {
    setOnAuthRequired((from) => {
      let redirectTo = from;

      try {
        redirectTo = window.sessionStorage.getItem(REDIRECT_STORAGE_KEY) ?? from;
      } catch {
        // Sem storage, utiliza a origem recebida diretamente do httpClient.
      }

      logout();

      navigate(paths.login, {
        replace: true,
        state: {
          from: redirectTo,
        },
      });
    });

    return () => setOnAuthRequired(null);
  }, [navigate, logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: user !== null && token !== null,
      loading,
      login,
      logout,
      refreshUser,
    }),
    [user, token, loading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
