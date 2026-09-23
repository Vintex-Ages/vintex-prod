import { createContext, useContext } from 'react';
import type { AuthUser } from '@/types/auth';

/**
 * Contexto de autenticação — objeto de contexto, tipo do valor, chaves de
 * `sessionStorage` e o hook `useAuth` (FE-FND-2, parte 3).
 *
 * Fica separado de `AuthContext.tsx` de propósito: aquele arquivo exporta o
 * componente `AuthProvider`, e a regra `react-refresh/only-export-components`
 * (com `--max-warnings 0`) não permite um mesmo arquivo exportar componente e
 * não-componente. Consumidores importam:
 *   - `AuthProvider` de `@/context/AuthContext`;
 *   - `useAuth` (e as chaves) daqui, `@/context/useAuth`.
 */

/** Chave de `sessionStorage` com o usuário logado (JSON de `AuthUser`). */
export const AUTH_USER_STORAGE_KEY = 'vintex.auth.user';

/** Chave de `sessionStorage` com o token da sessão ativa. */
export const AUTH_TOKEN_STORAGE_KEY = 'vintex.auth.token';

/** Valor exposto pelo `AuthContext` / retorno de `useAuth()`. */
export interface AuthContextValue {
  /** Usuário logado, ou `null` quando não há sessão. */
  user: AuthUser | null;
  /** Token da sessão ativa, ou `null`. */
  token: string | null;
  /** Derivado: há `user` e `token`. */
  isAuthenticated: boolean;
  /**
   * `true` enquanto o Provider restaura a sessão do `sessionStorage` no mount.
   * Os filhos já renderizam nesse meio-tempo; uma casca de app / guarda de rota
   * pode segurar conteúdo protegido enquanto for `true`.
   */
  loading: boolean;
  /** Registra a sessão (estado + `sessionStorage`) e passa o token ao httpClient. */
  login: (user: AuthUser, token: string) => void;
  /** Encerra a sessão (limpa estado + `sessionStorage`) e zera o token no httpClient. */
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Lê o `AuthContext`. Lança se usado fora de um `<AuthProvider>`.
 *
 * Usage:
 *   const { user, isAuthenticated, login, logout } = useAuth();
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth deve ser usado dentro de um <AuthProvider>.');
  }
  return context;
}
