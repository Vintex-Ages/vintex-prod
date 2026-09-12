/**
 * Contratos de autenticação compartilhados.
 *
 * Reúne o formato do usuário autenticado (`AuthUser`), os dados de entrada de
 * cadastro e login (`RegisterInput`, `LoginInput`) e o formato de erro da API
 * (`ApiErrorResponse`/`ApiError`), consumidos pelo httpClient, pelo
 * AuthContext e pelos services de auth. São a fronteira com o backend: trate-os
 * como contrato externo e mantenha estados de erro/carregamento explícitos em
 * quem os usa.
 *
 * O formato de erro segue o contrato definido pelo backend para ações
 * protegidas (FE-US · barreira de autenticação, #65): a resposta da API
 * envelopa o erro em um objeto `error`, com código, mensagem, o campo do
 * formulário associado (quando aplicável) e a rota de origem preservada pelo
 * `httpClient` (quando aplicável).
 *
 * ATENÇÃO: não há contrato formal publicado no repositório para os campos de
 * `AuthUser`/`RegisterInput`/`LoginInput` — são suposição a alinhar com o time
 * de backend antes de depender de campos além do essencial.
 *
 * Usage:
 *   import type { ApiErrorResponse } from '@/types/auth';
 *   import { AUTH_REQUIRED } from '@/types/auth';
 *
 *   function onApiError(response: ApiErrorResponse) {
 *     if (response.error.code === AUTH_REQUIRED) redirectToLogin();
 *     else showToast(response.error.message);
 *   }
 *
 *   const user: AuthUser = {
 *     id: 'u_1',
 *     name: 'Ana Brechó',
 *     email: 'ana@exemplo.com',
 *     is_seller: false,
 *     is_admin: false,
 *   };
 */

/**
 * Usuário autenticado, na forma que a interface consome hoje.
 *
 * Campos confirmados pela issue FE-FND-2: `id`, `name`, `email`. Os papéis são
 * expostos como flags booleanas (`is_seller`, `is_admin`), no formato enviado
 * pelo backend. Avatar e afins entram aqui quando o contrato do backend for
 * definido — não antecipe.
 */
export interface AuthUser {
  /**
   * Identificador estável do usuário. Mantido como `string` por decisão do time:
   * o backend envia id numérico, e a conversão fica a cargo de quem consome a
   * API, não deste tipo.
   */
  id: string;
  /** Nome de exibição. */
  name: string;
  /** E-mail usado no login. */
  email: string;
  /** `true` quando o usuário pode vender (tem brechó). Enviado pelo backend. */
  is_seller: boolean;
  /** `true` quando o usuário administra a plataforma. Enviado pelo backend. */
  is_admin: boolean;
}

/**
 * Dados enviados ao endpoint de cadastro.
 *
 * `phone` é opcional; os demais campos são obrigatórios no formulário de
 * registro.
 */
export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

/**
 * Credenciais enviadas ao endpoint de login.
 */
export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Conteúdo do erro padronizado devolvido pela API, dentro do envelope
 * `ApiErrorResponse`.
 */
export interface ApiError {
  /** Código estável usado pelo frontend para identificar o erro. Ex.: `AUTH_REQUIRED`. */
  code: string;

  /** Mensagem legível retornada pelo backend. */
  message: string;

  /** Campo do formulário associado ao erro, quando aplicável (ex.: `EMAIL_TAKEN`). */
  field?: 'email' | 'password';

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
 *     code: 'EMAIL_TAKEN',
 *     message: 'Este e-mail já está cadastrado.',
 *     field: 'email'
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
