import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { AUTH_REQUIRED, type ApiErrorResponse } from '@/types/auth';

/**
 * Cliente HTTP central do front-end.
 *
 * Responsabilidades relacionadas à autenticação:
 * - injeta o token Bearer quando existir sessão ativa;
 * - envia `X-Return-To` com a rota atual;
 * - renova a sessão uma vez antes de tratar um `401 AUTH_REQUIRED` (#275);
 * - trata respostas `401 AUTH_REQUIRED`;
 * - guarda a origem para o fluxo pós-login;
 * - dispara o handler React responsável pela navegação.
 */

/** Retorna o token da sessão ativa, ou `null`/`undefined` quando não há sessão. */
export type AuthTokenProvider = () => string | null | undefined;

/** Reage a um `401 AUTH_REQUIRED`, recebendo a rota de origem. */
export type AuthRequiredHandler = (from: string) => void;

/**
 * Renova a sessão. Devolve o novo access token, ou `null` quando não há como
 * renovar (sem refresh token guardado, ou o backend recusou o que havia).
 *
 * Quem registra é o `AuthProvider`, que é o dono do refresh token e de onde
 * ele é persistido. O interceptor não conhece React nem `sessionStorage`.
 */
export type SessionRefresher = () => Promise<string | null>;

/** Chave usada para guardar a rota de origem durante o fluxo de autenticação. */
export const REDIRECT_STORAGE_KEY = 'vintex.auth.redirectTo';

/** Rota de fallback quando não existe handler React registrado. */
const LOGIN_ROUTE = '/login';

let tokenProvider: AuthTokenProvider = () => null;
let onAuthRequired: AuthRequiredHandler | null = null;
let sessionRefresher: SessionRefresher | null = null;

/**
 * Renovação em curso, compartilhada por todas as requisições que tomaram 401
 * ao mesmo tempo.
 *
 * Sem isto, uma tela que dispara quatro chamadas em paralelo faria quatro
 * renovações: o backend **rotaciona** o refresh token a cada `POST
 * /auth/refresh`, então a primeira invalida o token que as outras três
 * carregam, e três delas derrubariam a sessão que a primeira acabou de
 * renovar. Com o single-flight, as quatro esperam a mesma promessa.
 */
let renovacaoEmCurso: Promise<string | null> | null = null;

/**
 * Marca de "já tentei renovar por causa desta requisição". Sem ela, uma
 * requisição que continua tomando 401 depois da renovação entra em laço.
 */
const JA_RENOVOU = Symbol('vintex.auth.jaRenovou');

type ConfigComMarca = InternalAxiosRequestConfig & { [JA_RENOVOU]?: true };

/**
 * Define como o `httpClient` obtém o token atual.
 */
export function setAuthTokenProvider(provider: AuthTokenProvider): void {
  tokenProvider = provider;
}

/**
 * Token da sessão ativa, para chamadas que não passam pelo `httpClient`
 * (Axios) — hoje só o streaming de `vintexAiService.chat()` (#199), que usa
 * `fetch` nativo porque o navegador não lê uma resposta SSE progressivamente
 * através do Axios.
 */
export function getAuthToken(): string | null | undefined {
  return tokenProvider();
}

/**
 * Reage a um 401 `AUTH_REQUIRED` fora do interceptor do Axios — mesma
 * lógica usada por ele, extraída para ser reaproveitada por chamadas via
 * `fetch` nativo. Não duplicar esse tratamento fora daqui.
 */
export function handleAuthRequired(from: string): void {
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

/**
 * Registra ou remove o handler executado quando a API responde
 * com `401 AUTH_REQUIRED`.
 */
export function setOnAuthRequired(handler: AuthRequiredHandler | null): void {
  onAuthRequired = handler;
}

/**
 * Registra ou remove a função que renova a sessão (#275).
 *
 * Sem refresher registrado o comportamento é o de antes: 401 `AUTH_REQUIRED`
 * cai direto em `handleAuthRequired`.
 */
export function setSessionRefresher(refresher: SessionRefresher | null): void {
  sessionRefresher = refresher;
  renovacaoEmCurso = null;
}

/** Renova no máximo uma vez por rajada de 401. */
function renovarUmaVez(): Promise<string | null> {
  if (!sessionRefresher) return Promise.resolve(null);
  if (renovacaoEmCurso) return renovacaoEmCurso;

  renovacaoEmCurso = sessionRefresher()
    .catch(() => null)
    .finally(() => {
      renovacaoEmCurso = null;
    });

  return renovacaoEmCurso;
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
  const marcada = config as ConfigComMarca;

  // Numa repeticao depois de renovar, o Authorization ja foi trocado pelo
  // token novo no interceptor de resposta. Sobrescrever aqui devolveria o
  // token velho: o `tokenProvider` e alimentado por estado React e nao
  // refletiu a renovacao ainda, entao a repeticao tomaria 401 de novo e a
  // renovacao nao serviria para nada.
  if (!marcada[JA_RENOVOU]) {
    const token = tokenProvider();

    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
  }

  config.headers.set('X-Return-To', getCurrentRoute());

  return config;
});

httpClient.interceptors.response.use(
  (response) => response,

  async (error: AxiosError<ApiErrorResponse>) => {
    const apiError = error.response?.data?.error;

    if (error.response?.status !== 401 || apiError?.code !== AUTH_REQUIRED) {
      return Promise.reject(error);
    }

    /**
     * Preferimos a origem devolvida pelo backend porque ela representa
     * exatamente o valor recebido em `X-Return-To`.
     *
     * Se por algum motivo ela não vier, usamos a rota atual como fallback.
     */
    const origem = apiError?.return_to || getCurrentRoute();
    const config = error.config as ConfigComMarca | undefined;

    // Antes de mandar o usuário para o login, tenta renovar a sessão uma vez
    // e repetir a requisição original (#275). O access token do backend vive
    // 30 minutos; antes disto, uma reunião de 90 minutos derrubava a sessão no
    // meio, e a única saída era logar de novo.
    if (config && !config[JA_RENOVOU]) {
      config[JA_RENOVOU] = true;
      const novoToken = await renovarUmaVez();

      if (novoToken) {
        config.headers.set('Authorization', `Bearer ${novoToken}`);
        return httpClient.request(config);
      }
    }

    handleAuthRequired(origem);
    return Promise.reject(error);
  },
);
