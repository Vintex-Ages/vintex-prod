/**
 * Contratos de autenticação compartilhados.
 *
 * O formato de erro segue o contrato definido pelo backend para ações
 * protegidas. A resposta da API possui um objeto `error`, que contém o código,
 * a mensagem e, quando aplicável, a rota de origem informada pelo frontend.
 *
 * Usage:
 *   import type { ApiErrorResponse } from '@/types/auth';
 *   import { AUTH_REQUIRED } from '@/types/auth';
 *
 *   function onApiError(response: ApiErrorResponse) {
 *     if (response.error.code === AUTH_REQUIRED) {
 *       redirectToLogin();
 *     }
 *   }
 */

/**
 * Usuário autenticado, na forma mínima consumida atualmente pelo frontend.
 */
export interface AuthUser {
  /** Identificador estável do usuário. */
  id: string;
  /** Nome de exibição. */
  name: string;
  /** E-mail usado no login. */
  email: string;
}

/**
 * Conteúdo do erro padronizado devolvido pela API.
 */
export interface ApiError {
  /** Código estável usado pelo frontend para identificar o erro. */
  code: string;

  /** Mensagem legível retornada pelo backend. */
  message: string;

  /**
   * Rota de origem enviada anteriormente no header `X-Return-To`.
   * Presente no fluxo de ações protegidas que retornam AUTH_REQUIRED.
   */
  return_to?: string;
}

/**
 * Estrutura externa da resposta de erro da API.
 *
 * Exemplo:
 * {
 *   error: {
 *     code: 'AUTH_REQUIRED',
 *     message: 'É necessário entrar ou criar conta para esta ação.',
 *     return_to: '/catalog?category=roupas'
 *   }
 * }
 */
export interface ApiErrorResponse {
  error: ApiError;
}

/**
 * Código retornado quando uma ação exige autenticação e não existe
 * uma sessão válida.
 */
export const AUTH_REQUIRED = 'AUTH_REQUIRED';

/**
 * Payload de cadastro de comprador (FE-US002-1). `phone` é opcional — decisão
 * da Sprint 1 não incluir CPF nesta tela.
 *
 * SUPOSIÇÃO a alinhar com o backend: nomes de campo assumidos como
 * `name`/`email`/`password`/`phone`, sem conversão de case (nenhum é
 * multi-palavra). CEP não entra aqui — é resolvido só na tela (`cepService`),
 * sem ir para o backend.
 */
export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

/** Resultado do cadastro: usuário autenticado + token, prontos para `useAuth().login()`. */
export interface RegisterResult {
  user: AuthUser;
  token: string;
}
