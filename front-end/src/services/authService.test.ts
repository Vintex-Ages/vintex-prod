import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { AUTH_REQUIRED } from '@/types/auth';
import type { ApiError, AuthUser } from '@/types/auth';

type AuthServiceModule = typeof import('./authService');

let authService: AuthServiceModule;
let httpClientRef: AxiosInstance;

/** Adapter falso: responde com o status/corpo passados, como sucesso. */
function successAdapter(status: number, data: unknown) {
  return (config: InternalAxiosRequestConfig) =>
    Promise.resolve({ data, status, statusText: 'OK', headers: {}, config });
}

/** Adapter falso: rejeita como um erro HTTP vindo do backend. */
function errorAdapter(status: number, data: Partial<ApiError>) {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject(
      new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
        data,
        status,
        statusText: 'Error',
        headers: {},
        config,
      }),
    );
}

describe('authService (mock, VITE_USE_MOCKS padrão)', () => {
  beforeEach(async () => {
    vi.resetModules();
    authService = await import('./authService');
  });

  it('register: cria a conta e devolve user + access_token', async () => {
    const { user, access_token } = await authService.register({
      name: 'Ana Brechó',
      email: 'ana@exemplo.com',
      password: 'senha123',
    });

    expect(user).toMatchObject({
      name: 'Ana Brechó',
      email: 'ana@exemplo.com',
      is_seller: false,
      is_admin: false,
    });
    expect(typeof user.id).toBe('string');
    expect(typeof access_token).toBe('string');
  });

  it('register: e-mail já cadastrado rejeita com ApiError EMAIL_TAKEN no campo email', async () => {
    await authService.register({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha123' });

    await expect(
      authService.register({ name: 'Outra', email: 'ana@exemplo.com', password: 'outrasenha1' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', field: 'email' });
  });

  it('register: senha curta rejeita com ApiError no campo password', async () => {
    await expect(
      authService.register({ name: 'Ana', email: 'ana2@exemplo.com', password: 'abc1' }),
    ).rejects.toMatchObject({ field: 'password' });
  });

  it('register: senha sem letra+número rejeita com ApiError no campo password', async () => {
    await expect(
      authService.register({ name: 'Ana', email: 'ana3@exemplo.com', password: 'somenteletras' }),
    ).rejects.toMatchObject({ field: 'password' });
  });

  it('login: credenciais corretas devolvem user + access_token', async () => {
    await authService.register({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha123' });

    const { user, access_token } = await authService.login({
      email: 'ana@exemplo.com',
      password: 'senha123',
    });

    expect(user.email).toBe('ana@exemplo.com');
    expect(typeof access_token).toBe('string');
  });

  it('login: credencial incorreta rejeita com ApiError INVALID_CREDENTIALS genérico (sem field)', async () => {
    await authService.register({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha123' });

    await expect(
      authService.login({ email: 'ana@exemplo.com', password: 'errada123' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(
      authService.login({ email: 'inexistente@exemplo.com', password: 'senha123' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('login: mensagem é igual para e-mail inexistente e senha errada (não revela o campo)', async () => {
    await authService.register({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha123' });

    let wrongPasswordError: ApiError | undefined;
    let unknownEmailError: ApiError | undefined;
    await authService
      .login({ email: 'ana@exemplo.com', password: 'errada123' })
      .catch((e: ApiError) => (wrongPasswordError = e));
    await authService
      .login({ email: 'inexistente@exemplo.com', password: 'senha123' })
      .catch((e: ApiError) => (unknownEmailError = e));

    expect(wrongPasswordError?.message).toBe(unknownEmailError?.message);
    expect(wrongPasswordError?.field).toBeUndefined();
  });

  it('logout: encerra a sessão mockada', async () => {
    await authService.register({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha123' });

    await expect(authService.logout()).resolves.toBeUndefined();
  });

  it('me: sem sessão ativa rejeita com ApiError AUTH_REQUIRED', async () => {
    await expect(authService.me()).rejects.toMatchObject({
      code: AUTH_REQUIRED,
    });
  });

  it('me: após login, devolve a identidade e os papéis do usuário atual', async () => {
    await authService.register({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha123' });

    const me: AuthUser = await authService.me();

    expect(me).toMatchObject({ email: 'ana@exemplo.com', is_seller: false, is_admin: false });
  });

  it('me: após logout, volta a rejeitar com AUTH_REQUIRED', async () => {
    await authService.register({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha123' });
    await authService.logout();

    await expect(authService.me()).rejects.toMatchObject({
      code: AUTH_REQUIRED,
    });
  });
});

describe('authService (API real, VITE_USE_MOCKS=false)', () => {
  beforeEach(async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    vi.resetModules();
    authService = await import('./authService');
    const httpClientModule = await import('./httpClient');
    httpClientRef = httpClientModule.httpClient;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('register: chama POST /auth/register e mapeia a resposta para { user, access_token }', async () => {
    httpClientRef.defaults.adapter = successAdapter(201, {
      user: {
        id: 7,
        name: 'Ana Brechó',
        email: 'ana@exemplo.com',
        is_admin: false,
        created_at: '2026-01-01T00:00:00Z',
      },
      access_token: 'jwt-abc',
      token_type: 'bearer',
    });

    const { user, access_token } = await authService.register({
      name: 'Ana Brechó',
      email: 'ana@exemplo.com',
      password: 'senha123',
    });

    expect(user).toMatchObject({
      id: '7',
      name: 'Ana Brechó',
      email: 'ana@exemplo.com',
      is_admin: false,
      is_seller: false,
    });
    expect(access_token).toBe('jwt-abc');
  });

  it('register: e-mail duplicado (409 EMAIL_TAKEN) rejeita como ApiError tipado no campo email', async () => {
    httpClientRef.defaults.adapter = errorAdapter(409, {
      code: 'EMAIL_TAKEN',
      message: 'E-mail já cadastrado.',
    });

    await expect(
      authService.register({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha123' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', field: 'email' });
  });

  it('login: chama POST /auth/login e mapeia a resposta', async () => {
    httpClientRef.defaults.adapter = successAdapter(200, {
      user: { id: 7, name: 'Ana Brechó', email: 'ana@exemplo.com', is_admin: false },
      access_token: 'jwt-abc',
      token_type: 'bearer',
    });

    const { user } = await authService.login({ email: 'ana@exemplo.com', password: 'senha123' });

    expect(user).toMatchObject({ id: '7', is_seller: false });
  });

  it('login: credencial errada (401 INVALID_CREDENTIALS) rejeita sem field', async () => {
    httpClientRef.defaults.adapter = errorAdapter(401, {
      code: 'INVALID_CREDENTIALS',
      message: 'E-mail ou senha inválidos.',
    });

    await expect(
      authService.login({ email: 'ana@exemplo.com', password: 'errada' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', field: undefined });
  });

  it('logout: chama POST /auth/logout e resolve sem corpo (204)', async () => {
    httpClientRef.defaults.adapter = successAdapter(204, undefined);

    await expect(authService.logout()).resolves.toBeUndefined();
  });

  it('me: chama GET /auth/me e mapeia is_seller vindo da API', async () => {
    httpClientRef.defaults.adapter = successAdapter(200, {
      id: 7,
      name: 'Ana Brechó',
      email: 'ana@exemplo.com',
      is_admin: false,
      is_seller: true,
    });

    const user = await authService.me();

    expect(user).toMatchObject({ id: '7', is_seller: true });
  });

  it('me: sem sessão (401) rejeita com ApiError', async () => {
    httpClientRef.defaults.adapter = errorAdapter(401, {
      code: AUTH_REQUIRED,
      message: 'Sessão expirada.',
    });

    await expect(authService.me()).rejects.toMatchObject({
      code: AUTH_REQUIRED,
    });
  });
});
