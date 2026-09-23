import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout as authServiceLogout } from '@/services/authService';
import {
  REDIRECT_STORAGE_KEY,
  setAuthTokenProvider,
  setOnAuthRequired,
} from '@/services/httpClient';
import type { AuthUser } from '@/types/auth';
import {
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
 * TODO(#106): trocar por `paths.login` de `@/routes/paths` quando a branch de
 * rotas (#106) for mergeada.
 *
 * O valor continua sendo o mesmo (`/login`).
 */
const LOGIN_PATH = '/login';

/**
 * Rota padrão usada quando o login é concluído sem existir
 * uma origem pendente.
 */
const DEFAULT_AFTER_LOGIN_PATH = '/';

/**
 * Lê e valida a sessão persistida.
 *
 * Retorna `null` quando os dados não existem ou estão corrompidos.
 */
function readStoredSession(): {
  user: AuthUser;
  token: string;
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
   * Registra uma sessão autenticada.
   *
   * Depois de persistir os dados da sessão, verifica se existe uma rota de
   * origem armazenada por uma ação protegida. Quando existe, volta para ela.
   *
   * Ao montar novamente a página de origem, `useProtectedAction` poderá
   * reconhecer a intenção pendente e retomar a ação correspondente.
   */
  const login = useCallback(
    (nextUser: AuthUser, nextToken: string) => {
      let redirectTo = DEFAULT_AFTER_LOGIN_PATH;

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
    [navigate],
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
    try {
      window.sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);

      window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // Nada a fazer quando o storage está indisponível.
    }

    setUser(null);
    setToken(null);

    void authServiceLogout().catch(() => {
      // Melhor esforço: falha no backend não deve impedir o logout local.
    });
  }, []);

  /**
   * Restaura uma sessão previamente persistida.
   */
  useEffect(() => {
    const stored = readStoredSession();

    if (stored) {
      setUser(stored.user);
      setToken(stored.token);
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

      navigate(LOGIN_PATH, {
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
    }),
    [user, token, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
