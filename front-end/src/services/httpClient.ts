import axios, { AxiosError, type AxiosInstance } from 'axios';
import { AUTH_REQUIRED, type ApiErrorResponse } from '@/types/auth';

/**
 * Cliente HTTP central do front-end.
 *
 * Responsabilidades relacionadas à autenticação:
 * - injeta o token Bearer quando existir sessão ativa;
 * - envia `X-Return-To` com a rota atual;
 * - trata respostas `401 AUTH_REQUIRED`;
 * - guarda a origem para o fluxo pós-login;
 * - dispara o handler React responsável pela navegação.
 */

/** Retorna o token da sessão ativa, ou `null`/`undefined` quando não há sessão. */
export type AuthTokenProvider = () => string | null | undefined;

/** Reage a um `401 AUTH_REQUIRED`, recebendo a rota de origem. */
export type AuthRequiredHandler = (from: string) => void;

/** Chave usada para guardar a rota de origem durante o fluxo de autenticação. */
export const REDIRECT_STORAGE_KEY = 'vintex.auth.redirectTo';

/** Rota de fallback quando não existe handler React registrado. */
const LOGIN_ROUTE = '/login';

let tokenProvider: AuthTokenProvider = () => null;
let onAuthRequired: AuthRequiredHandler | null = null;

/**
 * Define como o `httpClient` obtém o token atual.
 */
export function setAuthTokenProvider(provider: AuthTokenProvider): void {
  tokenProvider = provider;
}

/**
 * Registra ou remove o handler executado quando a API responde
 * com `401 AUTH_REQUIRED`.
 */
export function setOnAuthRequired(handler: AuthRequiredHandler | null): void {
  onAuthRequired = handler;
}

/**
 * Retorna a rota atual usada como origem da ação.
 *
 * Inclui pathname e query string, pois o usuário pode estar em uma listagem
 * filtrada e precisa voltar exatamente ao mesmo contexto.
 */
function getCurrentRoute(): string {
  return window.location.pathname + window.location.search;
}

export const httpClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

/**
 * Antes de cada chamada:
 * - adiciona Authorization quando houver token;
 * - envia a origem no header `X-Return-To`.
 *
 * O backend ecoa esse valor em `error.return_to` quando responde
 * com `AUTH_REQUIRED`.
 */
httpClient.interceptors.request.use((config) => {
  const token = tokenProvider();

  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }

  config.headers.set('X-Return-To', getCurrentRoute());

  return config;
});

httpClient.interceptors.response.use(
  (response) => response,

  (error: AxiosError<ApiErrorResponse>) => {
    const apiError = error.response?.data?.error;

    if (error.response?.status === 401 && apiError?.code === AUTH_REQUIRED) {
      /**
       * Preferimos a origem devolvida pelo backend porque ela representa
       * exatamente o valor recebido em `X-Return-To`.
       *
       * Se por algum motivo ela não vier, usamos a rota atual como fallback.
       */
      const from = apiError.return_to || getCurrentRoute();

      try {
        window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, from);
      } catch {
        // Storage indisponível: o fluxo ainda pode continuar via handler.
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
