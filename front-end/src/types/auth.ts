/**
 * Contratos de autenticação compartilhados (FE-FND-2).
 *
 * Reúne o formato do usuário autenticado (`AuthUser`), os dados de entrada de
 * cadastro e login (`RegisterInput`, `LoginInput`) e o formato de erro padrão
 * da API (`ApiError`), consumidos nas próximas etapas pelo httpClient e pelo
 * AuthContext. São a fronteira com o backend: trate-os como contrato externo e
 * mantenha estados de erro/carregamento explícitos em quem os usa.
 *
 * ATENÇÃO: não há contrato formal publicado no repositório. As formas abaixo
 * são uma suposição a alinhar com o time de backend antes de depender de
 * campos além do essencial.
 *
 * Usage:
 *   import type { ApiError, AuthUser } from '@/types/auth';
 *   import { AUTH_REQUIRED } from '@/types/auth';
 *
 *   function onApiError(error: ApiError) {
 *     if (error.code === AUTH_REQUIRED) redirectToLogin();
 *     else showToast(error.message);
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
  /** Nome de exibição. Já renderizado por `@/components/layout/AccountMenu` via `user.name`. */
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
 * Formato de erro padrão devolvido pela API.
 *
 * SUPOSIÇÃO a alinhar com o backend: não há contrato de erro publicado no
 * repositório. Assume-se `{ code, message }`, em que `code` é um identificador
 * estável para o cliente ramificar e `message` é texto legível (log / fallback
 * de UI). Quando o erro é de validação de um campo específico, `field` indica
 * qual. Campos adicionais (ex.: `details`, `status`) podem ser incluídos quando
 * o contrato existir.
 */
export interface ApiError {
  /** Identificador estável do erro. Ex.: `AUTH_REQUIRED`. */
  code: string;
  /** Mensagem legível por humanos. */
  message: string;
  /** Campo do formulário associado ao erro, quando aplicável. */
  field?: 'email' | 'password';
}

/**
 * Valor de `ApiError['code']` para requisição que exige sessão autenticada e
 * não a encontrou. Citado na issue FE-FND-2; será usado pelo httpClient /
 * AuthContext para disparar o fluxo de re-login. Demais códigos ainda não
 * catalogados — evite espalhar strings soltas, prefira uma constante.
 */
export const AUTH_REQUIRED = 'AUTH_REQUIRED';
