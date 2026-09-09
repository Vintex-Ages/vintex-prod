import { describe, expect, it } from 'vitest';
import { AUTH_REQUIRED } from './auth';
import type { ApiError, AuthUser } from './auth';

describe('types/auth', () => {
  it('AuthUser descreve o usuário logado com id, name e email', () => {
    const user: AuthUser = { id: 'u_1', name: 'Ana Brechó', email: 'ana@exemplo.com' };

    expect(user).toEqual({ id: 'u_1', name: 'Ana Brechó', email: 'ana@exemplo.com' });
    expect(typeof user.id).toBe('string');
    expect(typeof user.name).toBe('string');
    expect(typeof user.email).toBe('string');
  });

  it('ApiError descreve o erro padrão da API com code e message', () => {
    const error: ApiError = { code: 'AUTH_REQUIRED', message: 'Faça login para continuar.' };

    expect(typeof error.code).toBe('string');
    expect(typeof error.message).toBe('string');
  });

  it('AUTH_REQUIRED é a constante do código de sessão ausente citado na issue', () => {
    expect(AUTH_REQUIRED).toBe('AUTH_REQUIRED');

    const error: ApiError = { code: AUTH_REQUIRED, message: 'Sessão expirada.' };
    expect(error.code).toBe(AUTH_REQUIRED);
  });
});
