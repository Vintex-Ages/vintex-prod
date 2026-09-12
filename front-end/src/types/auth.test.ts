import { describe, expect, it } from 'vitest';
import { AUTH_REQUIRED, type ApiError, type ApiErrorResponse, type AuthUser } from './auth';

/**
 * Testes dos contratos compartilhados de autenticação.
 *
 * Além de validar os tipos usados pelo frontend, estes testes registram o
 * formato esperado para respostas de ações protegidas. Conforme o contrato
 * BE-US001-2, erros de autenticação chegam no envelope:
 *
 * {
 *   error: {
 *     code,
 *     message,
 *     return_to
 *   }
 * }
 *
 * `return_to` representa a origem enviada pelo frontend em `X-Return-To`.
 */
describe('auth types', () => {
  /**
   * Mantém documentados os dados mínimos que o frontend espera de um
   * usuário autenticado.
   */
  it('AuthUser descreve os dados mínimos do usuário autenticado', () => {
    const user: AuthUser = {
      id: 'u_1',
      name: 'Ana Brechó',
      email: 'ana@exemplo.com',
    };

    expect(user.id).toBe('u_1');
    expect(user.name).toBe('Ana Brechó');
    expect(user.email).toBe('ana@exemplo.com');
  });

  /**
   * Valida o conteúdo interno do erro usado no fluxo de autenticação.
   * `return_to` é opcional no tipo porque nem todo erro da API precisa
   * representar uma ação protegida.
   */
  it('ApiError descreve o conteúdo do erro padronizado da API', () => {
    const error: ApiError = {
      code: AUTH_REQUIRED,
      message: 'É necessário entrar ou criar conta para esta ação.',
      return_to: '/catalog?category=roupas',
    };

    expect(error.code).toBe(AUTH_REQUIRED);
    expect(error.return_to).toBe('/catalog?category=roupas');
  });

  /**
   * Garante que o frontend represente corretamente o envelope de erro
   * definido pelo backend, evitando acessar `code` diretamente na raiz
   * da resposta.
   */
  it('ApiErrorResponse segue o envelope retornado pelo backend', () => {
    const response: ApiErrorResponse = {
      error: {
        code: AUTH_REQUIRED,
        message: 'É necessário entrar ou criar conta para esta ação.',
        return_to: '/product?id=10',
      },
    };

    expect(response.error.code).toBe(AUTH_REQUIRED);
    expect(response.error.return_to).toBe('/product?id=10');
  });

  /**
   * Evita espalhar a string AUTH_REQUIRED diretamente pelo projeto.
   */
  it('AUTH_REQUIRED é a constante usada para sessão ausente', () => {
    expect(AUTH_REQUIRED).toBe('AUTH_REQUIRED');
  });
});
