import { describe, expect, it } from 'vitest';
import { AUTH_REQUIRED } from './auth';
import type { ApiError, AuthUser, LoginInput, RegisterInput } from './auth';

describe('types/auth', () => {
  it('AuthUser descreve o usuário logado com id, name, email e papéis', () => {
    const user: AuthUser = {
      id: 'u_1',
      name: 'Ana Brechó',
      email: 'ana@exemplo.com',
      is_seller: false,
      is_admin: false,
    };

    expect(user).toEqual({
      id: 'u_1',
      name: 'Ana Brechó',
      email: 'ana@exemplo.com',
      is_seller: false,
      is_admin: false,
    });
    expect(typeof user.id).toBe('string');
    expect(typeof user.name).toBe('string');
    expect(typeof user.email).toBe('string');
    expect(typeof user.is_seller).toBe('boolean');
    expect(typeof user.is_admin).toBe('boolean');
  });

  it('RegisterInput descreve os dados de cadastro, com phone opcional', () => {
    const withoutPhone: RegisterInput = {
      name: 'Ana Brechó',
      email: 'ana@exemplo.com',
      password: 'senha123',
    };
    const withPhone: RegisterInput = { ...withoutPhone, phone: '51999990000' };

    expect(withoutPhone.phone).toBeUndefined();
    expect(withPhone.phone).toBe('51999990000');
  });

  it('LoginInput descreve email e password', () => {
    const input: LoginInput = { email: 'ana@exemplo.com', password: 'senha123' };

    expect(typeof input.email).toBe('string');
    expect(typeof input.password).toBe('string');
  });

  it('ApiError descreve o erro padrão da API com code, message e field opcional', () => {
    const error: ApiError = { code: 'AUTH_REQUIRED', message: 'Faça login para continuar.' };
    const fieldError: ApiError = {
      code: 'EMAIL_TAKEN',
      message: 'E-mail já cadastrado.',
      field: 'email',
    };

    expect(typeof error.code).toBe('string');
    expect(typeof error.message).toBe('string');
    expect(error.field).toBeUndefined();
    expect(fieldError.field).toBe('email');
  });

  it('AUTH_REQUIRED é a constante do código de sessão ausente citado na issue', () => {
    expect(AUTH_REQUIRED).toBe('AUTH_REQUIRED');

    const error: ApiError = { code: AUTH_REQUIRED, message: 'Sessão expirada.' };
    expect(error.code).toBe(AUTH_REQUIRED);
  });
});
