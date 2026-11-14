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
 * Resultado de uma tentativa de renovação.
 *
 * Os dois modos de falha são diferentes e recebiam o mesmo `null` antes:
 *
 * - `sessao-encerrada`: o backend recusou o refresh token, ou não havia nenhum
 *   guardado. A sessão acabou de verdade e o usuário vai ao login.
 * - `falha-transitoria`: não deu para *tentar* — rede fora, timeout, CORS, 5xx.
 *   A sessão pode muito bem estar viva. Mandar o usuário ao login aqui é o
 *   defeito que este PR existe para não cometer: um blip de rede no minuto 31
 *   de uma reunião de 90 derrubava a sessão exatamente como o token expirando.
 */
export type RefreshResult =
  | { estado: 'renovada'; token: string }
  | { estado: 'sessao-encerrada' }
  | { estado: 'falha-transitoria' };

/**
 * Renova a sessão.
 *
 * Quem registra é o `AuthProvider`, que é o dono do refresh token e de onde
 * ele é persistido. O interceptor não conhece React nem `sessionStorage`.
 */
export type SessionRefresher = () => Promise<RefreshResult>;

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
let renovacaoEmCurso: Promise<RefreshResult> | null = null;

/**
 * Marca de "já tentei renovar por causa desta requisição". Sem ela, uma
 * requisição que continua tomando 401 depois da renovação entra em laço.
 *
 * **Chave string, não `Symbol`.** O `mergeConfig` do Axios só passou a copiar
 * símbolos enumeráveis na 1.19.0; em 1.7 a 1.18 ele itera `Object.keys`, que
 * descarta `Symbol`. O `package.json` declara `^1.7.4`, então uma instalação
 * que resolvesse abaixo de 1.19 perderia a marca na repetição, injetaria o
 * token velho e voltaria ao laço de renovar. Com chave string não depende da
 * versão.
 */
const JA_RENOVOU = '_vintexJaRenovou';

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
function renovarUmaVez(): Promise<RefreshResult> {
  if (!sessionRefresher) return Promise.resolve({ estado: 'sessao-encerrada' });
  if (renovacaoEmCurso) return renovacaoEmCurso;

  renovacaoEmCurso = sessionRefresher()
    // Refresher que lança é falha de quem renova, não recusa do backend: não é
    // motivo para deslogar.
    .catch((): RefreshResult => ({ estado: 'falha-transitoria' }))
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
      const resultado = await renovarUmaVez();

      if (resultado.estado === 'renovada') {
        config.headers.set('Authorization', `Bearer ${resultado.token}`);
        return httpClient.request(config);
      }

      // Não deu para tentar renovar: esta requisição falha, e a sessão fica de
      // pé para a próxima. Mandar ao login aqui trocaria um erro de rede por um
      // logout, que é pior e é irreversível para quem estava no meio de algo.
      if (resultado.estado === 'falha-transitoria') {
        return Promise.reject(error);
      }
    }

    handleAuthRequired(origem);
    return Promise.reject(error);
  },
);
