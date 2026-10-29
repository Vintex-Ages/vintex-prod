import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
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

/**
 * Adapter falso: rejeita como um erro HTTP vindo do backend.
 *
 * `error` é o conteúdo de `ApiError`; o corpo da resposta é envelopado como
 * `{ error }` (`ApiErrorResponse`, ver `@/types/auth`), igual ao contrato real.
 */
function errorAdapter(status: number, error: Partial<ApiError>) {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject(
      new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
        data: { error },
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

  // Objetivo: garantir o registro do aceite dos termos (FE-SVC-legal, #203).
  it('register: guarda no mock a versão dos termos aceita (acceptedTermsVersion)', async () => {
    await authService.register({
      name: 'Ana',
      email: 'ana@exemplo.com',
      password: 'senha123',
      acceptedTermsVersion: 'termos-0.1-placeholder',
    });

    expect(authService.getMockAcceptedTermsVersion('ana@exemplo.com')).toBe(
      'termos-0.1-placeholder',
    );
  });

  it('register: sem acceptedTermsVersion, nenhuma versão fica registrada', async () => {
    await authService.register({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha123' });

    expect(authService.getMockAcceptedTermsVersion('ana@exemplo.com')).toBeUndefined();
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

  it('markCurrentAccountAsSeller: marca is_seller = true na conta logada (usado por storeService.createStore)', async () => {
    await authService.register({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha123' });

    await authService.markCurrentAccountAsSeller();

    const me = await authService.me();
    expect(me.is_seller).toBe(true);
  });

  it('markCurrentAccountAsSeller: sem sessão ativa, não faz nada (não lança)', async () => {
    await expect(authService.markCurrentAccountAsSeller()).resolves.toBeUndefined();
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

  it('register: envia acceptedTermsVersion como accepted_terms_version', async () => {
    let sentBody: unknown;
    httpClientRef.defaults.adapter = (config) => {
      sentBody = JSON.parse(config.data as string);
      return successAdapter(201, {
        user: { id: 7, name: 'Ana', email: 'ana@exemplo.com', is_admin: false },
        access_token: 'jwt-abc',
      })(config);
    };

    await authService.register({
      name: 'Ana',
      email: 'ana@exemplo.com',
      password: 'senha123',
      acceptedTermsVersion: 'termos-0.1-placeholder',
    });

    expect(sentBody).toEqual({
      name: 'Ana',
      email: 'ana@exemplo.com',
      password: 'senha123',
      accepted_terms_version: 'termos-0.1-placeholder',
    });
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

  // A URL é verificada de verdade: o título dizia `/auth/me` e o adaptador
  // respondia a qualquer caminho, então o front chamava uma rota que o back não
  // tem (o back serve `/users/me`, como o ADR 0001 §4 manda) sem nada acusar.
  it('me: chama GET /users/me e mapeia is_seller vindo da API', async () => {
    let pedido: string | undefined;
    httpClientRef.defaults.adapter = (config) => {
      pedido = config.url;
      return Promise.resolve({
        data: {
          id: 7,
          name: 'Ana Brechó',
          email: 'ana@exemplo.com',
          is_admin: false,
          is_seller: true,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    const user = await authService.me();

    expect(pedido).toBe('/users/me');
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

  it('markCurrentAccountAsSeller: no modo API real é um no-op (o backend marca is_seller ao criar a loja)', async () => {
    await expect(authService.markCurrentAccountAsSeller()).resolves.toBeUndefined();
  });
});

/**
 * Renovação de sessão (#275).
 *
 * `POST /auth/refresh` é o que o interceptor de 401 dispara, então ele **não
 * passa pelo `httpClient`**: se passasse, um refresh recusado faria o
 * interceptor tentar renovar a própria renovação. Por isso estes testes
 * trocam o adapter do `axios` cru, e não o do `httpClient`.
 */
describe('authService.refresh', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    axios.defaults.adapter = undefined;
  });

  it('API real: manda o refresh no corpo, sem Authorization, e devolve o par novo', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    vi.resetModules();
    const servico = await import('./authService');

    const chamadas: { url?: string; corpo: unknown; auth: unknown }[] = [];
    axios.defaults.adapter = (config) => {
      chamadas.push({
        url: config.url,
        corpo: JSON.parse((config.data as string) ?? 'null'),
        auth: config.headers?.Authorization,
      });
      return Promise.resolve({
        data: {
          user: { id: 7, name: 'Ana', email: 'ana@exemplo.com', is_admin: false },
          access_token: 'jwt-novo',
          refresh_token: 'refresh-novo',
          token_type: 'bearer',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    const resultado = await servico.refresh('refresh-velho');

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toContain('/auth/refresh');
    expect(chamadas[0].corpo).toEqual({ refresh_token: 'refresh-velho' });
    // O refresh token é a única credencial da renovação; um access token morto
    // no header não ajuda e, se o backend passar a validá-lo, atrapalha.
    expect(chamadas[0].auth).toBeUndefined();
    expect(resultado).toMatchObject({
      access_token: 'jwt-novo',
      refresh_token: 'refresh-novo',
    });
    expect(resultado.user).toMatchObject({ id: '7', email: 'ana@exemplo.com' });
  });

  it('API real: refresh recusado rejeita com ApiError', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    vi.resetModules();
    const servico = await import('./authService');

    axios.defaults.adapter = (config) =>
      Promise.reject(
        new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
          data: { error: { code: 'AUTH_REQUIRED', message: 'Sessão expirada.' } },
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
        }),
      );

    await expect(servico.refresh('morto')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('mock: sem sessão aberta, recusa', async () => {
    vi.resetModules();
    const servico = await import('./authService');

    await expect(servico.refresh('qualquer')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('mock: com sessão aberta, devolve par novo a cada chamada', async () => {
    vi.resetModules();
    const servico = await import('./authService');

    const aberta = await servico.register({
      name: 'Ana',
      email: 'ana.refresh@exemplo.com',
      password: 'senha123',
    });

    const primeira = await servico.refresh(aberta.refresh_token);
    const segunda = await servico.refresh(primeira.refresh_token);

    // Rotação: dois refresh seguidos nunca devolvem o mesmo token, como na API
    // real. Um mock que repetisse o valor esconderia o bug de usar o anterior.
    expect(primeira.refresh_token).not.toBe(aberta.refresh_token);
    expect(segunda.refresh_token).not.toBe(primeira.refresh_token);
  });
});

describe('authService.logout — revogação da sessão (#275)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('API real: com refresh token, manda ele no corpo para o backend revogar', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    vi.resetModules();
    const servico = await import('./authService');
    const { httpClient } = await import('./httpClient');

    let corpo: unknown = 'nao chamado';
    httpClient.defaults.adapter = (config) => {
      corpo = config.data === undefined ? undefined : JSON.parse(config.data as string);
      return Promise.resolve({
        data: null,
        status: 204,
        statusText: 'No Content',
        headers: {},
        config,
      });
    };

    await servico.logout('refresh-vivo');

    expect(corpo).toEqual({ refresh_token: 'refresh-vivo' });
  });

  it('API real: sem refresh token, segue sem corpo', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    vi.resetModules();
    const servico = await import('./authService');
    const { httpClient } = await import('./httpClient');

    let tinhaCorpo = true;
    httpClient.defaults.adapter = (config) => {
      tinhaCorpo = config.data !== undefined;
      return Promise.resolve({
        data: null,
        status: 204,
        statusText: 'No Content',
        headers: {},
        config,
      });
    };

    await servico.logout();

    // `RefreshTokenRequest | None` no back: corpo ausente continua valendo.
    expect(tinhaCorpo).toBe(false);
  });
});
