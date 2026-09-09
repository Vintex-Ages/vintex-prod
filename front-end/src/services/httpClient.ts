import axios, { AxiosError, type AxiosInstance } from 'axios';
import { AUTH_REQUIRED, type ApiError } from '@/types/auth';

/**
 * Cliente HTTP central do front-end (FE-FND-2, parte 2).
 *
 * Instância única do Axios com `baseURL` vinda de `import.meta.env.VITE_API_BASE_URL`
 * (ver `.env.example`). Todo acesso à API deve passar por aqui — componentes não
 * espalham detalhes de transporte (`.ai/coding-rules.md`).
 *
 * Decisões de desacoplamento (este módulo roda fora da árvore React, sem acesso
 * a hooks como `useNavigate`):
 *
 * 1. TOKEN — não lê storage direto. Um *provider* é injetado via
 *    `setAuthTokenProvider`. Motivo: a estratégia de armazenamento de token no
 *    cliente ainda é decisão pendente (`.ai/architecture.md`); o provider mantém
 *    o service alheio a essa escolha e ao React. Default: sem token.
 *
 * 2. REDIRECT NO 401 — ao receber `401` cujo corpo traz `code === AUTH_REQUIRED`
 *    (constante de `@/types/auth`), o interceptor:
 *      a) grava a rota atual em `sessionStorage[REDIRECT_STORAGE_KEY]` para o
 *         pós-login voltar a ela — `sessionStorage` porque sobrevive a um reload
 *         completo (caso b) e é lido/limpo depois pela tela de login;
 *      b) chama o handler injetado via `setOnAuthRequired` (uma "ponte" React,
 *         criada em parte posterior, registra um handler com `useNavigate`);
 *      c) se nenhum handler foi registrado, faz fallback para
 *         `window.location.assign('/login')` (reload completo, mas garante que o
 *         usuário sai de uma tela protegida).
 *    O erro continua sendo rejeitado para quem chamou tratar seus próprios estados.
 *
 * Usage:
 *   import { httpClient, setAuthTokenProvider, setOnAuthRequired } from '@/services/httpClient';
 *
 *   // Na inicialização da app / na ponte de auth (parte 3):
 *   setAuthTokenProvider(() => session?.token ?? null);
 *   setOnAuthRequired((from) => navigate('/login', { state: { from } }));
 *
 *   // Em um service de recurso:
 *   const { data } = await httpClient.get<Produto[]>('/produtos');
 */

/** Retorna o token da sessão ativa, ou `null`/`undefined` quando não há sessão. */
export type AuthTokenProvider = () => string | null | undefined;

/** Reage a um `401 AUTH_REQUIRED`, recebendo a rota de origem (`pathname + search`). */
export type AuthRequiredHandler = (from: string) => void;

/** Chave de `sessionStorage` onde a rota de origem é guardada para o pós-login. */
export const REDIRECT_STORAGE_KEY = 'vintex.auth.redirectTo';

/** Rota de destino quando o redirecionamento precisa acontecer sem a ponte React. */
const LOGIN_ROUTE = '/login';

let tokenProvider: AuthTokenProvider = () => null;
let onAuthRequired: AuthRequiredHandler | null = null;

/**
 * Define como o `httpClient` obtém o token atual. Chamado pela camada de auth
 * (parte 3) na inicialização; enquanto não for chamado, nenhuma requisição leva
 * `Authorization`.
 */
export function setAuthTokenProvider(provider: AuthTokenProvider): void {
  tokenProvider = provider;
}

/**
 * Registra (ou remove, com `null`) o handler disparado num `401 AUTH_REQUIRED`.
 * Sem handler, o interceptor cai no fallback `window.location`.
 */
export function setOnAuthRequired(handler: AuthRequiredHandler | null): void {
  onAuthRequired = handler;
}

export const httpClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

httpClient.interceptors.request.use((config) => {
  const token = tokenProvider();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<Partial<ApiError>>) => {
    if (error.response?.status === 401 && error.response.data?.code === AUTH_REQUIRED) {
      const from = window.location.pathname + window.location.search;

      try {
        window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, from);
      } catch {
        // sessionStorage indisponível (modo restrito/privado) — segue sem persistir a origem.
      }

      if (onAuthRequired) {
        onAuthRequired(from);
      } else {
        window.location.assign(LOGIN_ROUTE);
      }
    }

    return Promise.reject(error);
  },
);
