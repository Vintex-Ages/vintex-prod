import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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
 * Provider de autenticação (FE-FND-2, parte 3). Mantém `user`/`token` em estado
 * React e espelhados em `sessionStorage`, e conecta o `httpClient` (parte 2) ao
 * ciclo de vida da sessão:
 *
 * - registra em `setAuthTokenProvider` um provider que devolve o token atual,
 *   re-registrando a cada mudança de token (login, logout, restauração);
 * - registra em `setOnAuthRequired` um handler para o `401 AUTH_REQUIRED`: lê a
 *   rota de origem salva pelo httpClient (`REDIRECT_STORAGE_KEY`), faz `logout()`
 *   e navega para o login com `useNavigate` (react-router v7).
 *
 * Ao montar, restaura a sessão do `sessionStorage` num efeito; `loading` fica
 * `true` até isso terminar. Os filhos renderizam desde já — quem precisar
 * aguardar a restauração deve observar `loading` via `useAuth()`.
 *
 * Precisa estar dentro de um `<Router>` (usa `useNavigate`).
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
 *     return isAuthenticated ? <button onClick={logout}>Sair de {user?.name}</button> : null;
 *   }
 */

/**
 * TODO(#106): trocar por `paths.login` de `@/routes/paths` quando a branch de
 * rotas (#106) for mergeada. O valor é o mesmo (`'/login'`); a constante local
 * evita divergência até os paths virarem fonte única.
 */
const LOGIN_PATH = '/login';

/** Lê e valida a sessão persistida. Retorna `null` se ausente ou corrompida. */
function readStoredSession(): { user: AuthUser; token: string } | null {
  try {
    const rawUser = window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY);
    const token = window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    if (!rawUser || !token) {
      return null;
    }
    return { user: JSON.parse(rawUser) as AuthUser, token };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const login = useCallback((nextUser: AuthUser, nextToken: string) => {
    try {
      window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));
      window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, nextToken);
    } catch {
      // sessionStorage indisponível (modo restrito) — sessão só em memória nesta aba.
    }
    setUser(nextUser);
    setToken(nextToken);
  }, []);

  const logout = useCallback(() => {
    try {
      window.sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
      window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // nada a fazer: storage indisponível.
    }
    setUser(null);
    setToken(null);
  }, []);

  // Restaura a sessão persistida uma vez, no mount.
  useEffect(() => {
    const stored = readStoredSession();
    if (stored) {
      setUser(stored.user);
      setToken(stored.token);
    }
    setLoading(false);
  }, []);

  // Mantém o httpClient com o token atual; re-registra a cada mudança.
  useEffect(() => {
    setAuthTokenProvider(() => token);
  }, [token]);

  useEffect(() => () => setAuthTokenProvider(() => null), []);

  // Handler do 401 AUTH_REQUIRED disparado pelo httpClient.
  useEffect(() => {
    setOnAuthRequired((from) => {
      let redirectTo = from;
      try {
        redirectTo = window.sessionStorage.getItem(REDIRECT_STORAGE_KEY) ?? from;
      } catch {
        // sem storage: usa a rota recebida do httpClient.
      }
      logout();
      navigate(LOGIN_PATH, { replace: true, state: { from: redirectTo } });
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
