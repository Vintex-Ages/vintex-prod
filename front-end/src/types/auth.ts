/**
 * Contratos de autenticação compartilhados (FE-FND-2).
 *
 * Reúne o formato do usuário autenticado (`AuthUser`) e o formato de erro
 * padrão da API (`ApiError`), consumidos nas próximas etapas pelo httpClient e
 * pelo AuthContext. São a fronteira com o backend: trate-os como contrato
 * externo e mantenha estados de erro/carregamento explícitos em quem os usa.
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
 *   const user: AuthUser = { id: 'u_1', name: 'Ana Brechó', email: 'ana@exemplo.com' };
 */

/**
 * Usuário autenticado, na forma mínima que a interface consome hoje.
 *
 * Campos confirmados pela issue FE-FND-2: `id`, `name`, `email`. Papel
 * (comprador / vendedor / dono da plataforma), avatar e afins entram aqui
 * quando o contrato do backend for definido — não antecipe.
 */
export interface AuthUser {
  /** Identificador estável do usuário. Formato (uuid vs. numérico) a confirmar com o backend. */
  id: string;
  /** Nome de exibição. Já renderizado por `@/components/layout/AccountMenu` via `user.name`. */
  name: string;
  /** E-mail usado no login. */
  email: string;
}

/**
 * Formato de erro padrão devolvido pela API.
 *
 * SUPOSIÇÃO a alinhar com o backend: não há contrato de erro publicado no
 * repositório. Assume-se `{ code, message }`, em que `code` é um identificador
 * estável para o cliente ramificar e `message` é texto legível (log / fallback
 * de UI). Campos adicionais (ex.: `details`, `status`) podem ser incluídos
 * quando o contrato existir.
 */
export interface ApiError {
  /** Identificador estável do erro. Ex.: `AUTH_REQUIRED`. */
  code: string;
  /** Mensagem legível por humanos. */
  message: string;
}

/**
 * Valor de `ApiError['code']` para requisição que exige sessão autenticada e
 * não a encontrou. Citado na issue FE-FND-2; será usado pelo httpClient /
 * AuthContext para disparar o fluxo de re-login. Demais códigos ainda não
 * catalogados — evite espalhar strings soltas, prefira uma constante.
 */
export const AUTH_REQUIRED = 'AUTH_REQUIRED';
