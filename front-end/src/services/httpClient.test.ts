import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  REDIRECT_STORAGE_KEY,
  httpClient,
  setAuthTokenProvider,
  setOnAuthRequired,
  setSessionRefresher,
} from './httpClient';

/** Adapter falso: registra a config final e responde 200. */
function captureAdapter(store: { config?: InternalAxiosRequestConfig }) {
  return (config: InternalAxiosRequestConfig) => {
    store.config = config;

    return Promise.resolve({
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
}

/**
 * Adapter falso para simular o contrato real do backend:
 * { error: { code, message, return_to } }
 */
function unauthorizedAdapter(code: string, returnTo?: string) {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject(
      new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, null, {
        data: {
          error: {
            code,
            message: 'É necessário entrar ou criar conta para esta ação.',
            ...(returnTo ? { return_to: returnTo } : {}),
          },
        },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
      }),
    );
}

describe('httpClient', () => {
  beforeEach(() => {
    setAuthTokenProvider(() => null);
    setOnAuthRequired(null);
    // Sem refresher, o 401 cai direto no handler: e o comportamento que os
    // testes deste bloco descrevem, de antes do #275.
    setSessionRefresher(null);
    window.sessionStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('injeta Authorization: Bearer <token> quando há sessão ativa', async () => {
    const store: { config?: InternalAxiosRequestConfig } = {};
    httpClient.defaults.adapter = captureAdapter(store);
    setAuthTokenProvider(() => 'tok-123');

    await httpClient.get('/qualquer');

    expect(store.config?.headers.get('Authorization')).toBe('Bearer tok-123');
  });

  it('não injeta Authorization quando não há token', async () => {
    const store: { config?: InternalAxiosRequestConfig } = {};
    httpClient.defaults.adapter = captureAdapter(store);
    setAuthTokenProvider(() => null);

    await httpClient.get('/qualquer');

    expect(store.config?.headers.has('Authorization')).toBe(false);
  });

  it('envia X-Return-To com a rota atual', async () => {
    window.history.pushState({}, '', '/catalog?categoria=roupas');

    const store: { config?: InternalAxiosRequestConfig } = {};
    httpClient.defaults.adapter = captureAdapter(store);

    await httpClient.get('/favorites');

    expect(store.config?.headers.get('X-Return-To')).toBe('/catalog?categoria=roupas');
  });

  it('no 401 AUTH_REQUIRED guarda o return_to devolvido pelo backend e dispara o handler', async () => {
    window.history.pushState({}, '', '/outra-rota');

    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);

    httpClient.defaults.adapter = unauthorizedAdapter('AUTH_REQUIRED', '/catalog?categoria=roupas');

    await expect(httpClient.get('/favorites')).rejects.toBeInstanceOf(AxiosError);

    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe('/catalog?categoria=roupas');

    expect(onAuthRequired).toHaveBeenCalledWith('/catalog?categoria=roupas');
  });

  it('usa a rota atual como fallback quando AUTH_REQUIRED não traz return_to', async () => {
    window.history.pushState({}, '', '/product?id=10');

    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);

    httpClient.defaults.adapter = unauthorizedAdapter('AUTH_REQUIRED');

    await expect(httpClient.get('/favorites')).rejects.toBeInstanceOf(AxiosError);

    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe('/product?id=10');

    expect(onAuthRequired).toHaveBeenCalledWith('/product?id=10');
  });

  it('no 401 sem handler registrado faz fallback para /login', async () => {
    const assign = vi.fn();

    vi.stubGlobal('location', {
      pathname: '/perfil',
      search: '',
      assign,
    });

    setOnAuthRequired(null);

    httpClient.defaults.adapter = unauthorizedAdapter('AUTH_REQUIRED', '/perfil');

    await expect(httpClient.get('/protegido')).rejects.toBeInstanceOf(AxiosError);

    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('não dispara o fluxo de autenticação para um 401 de outro code', async () => {
    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);

    httpClient.defaults.adapter = unauthorizedAdapter('INVALID_CREDENTIALS');

    await expect(httpClient.get('/login')).rejects.toBeInstanceOf(AxiosError);

    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBeNull();
  });
});

/**
 * Renovação de sessão (#275).
 *
 * O access token do backend vive 30 minutos. Antes disto, uma sessão morria no
 * meio de uma reunião de 90 e a única saída era logar de novo.
 */
describe('httpClient — renovação de sessão', () => {
  beforeEach(() => {
    setAuthTokenProvider(() => null);
    setOnAuthRequired(null);
    setSessionRefresher(null);
    window.sessionStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    setSessionRefresher(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /**
   * Responde 401 `AUTH_REQUIRED` nas `quantos` primeiras chamadas e 200 depois.
   * Registra o Authorization de cada tentativa, que é como se verifica que a
   * repetição saiu com o token novo e não com o antigo.
   */
  function adapterQue401(quantos: number, vistos: (string | undefined)[]) {
    let chamadas = 0;
    return (config: InternalAxiosRequestConfig) => {
      chamadas += 1;
      vistos.push(config.headers.get('Authorization') as string | undefined);
      if (chamadas <= quantos) {
        return Promise.reject(
          new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, null, {
            data: { error: { code: 'AUTH_REQUIRED', message: 'Sessão expirada.' } },
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
            config,
          }),
        );
      }
      return Promise.resolve({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };
  }

  it('renova e repete a requisição original com o token novo', async () => {
    const vistos: (string | undefined)[] = [];
    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);
    setAuthTokenProvider(() => 'token-velho');
    const renovar = vi.fn().mockResolvedValue('token-novo');
    setSessionRefresher(renovar);

    httpClient.defaults.adapter = adapterQue401(1, vistos);

    const resposta = await httpClient.get('/users/me/products');

    expect(resposta.data).toEqual({ ok: true });
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(vistos).toEqual(['Bearer token-velho', 'Bearer token-novo']);
    // A sessão foi renovada: o usuário não vê tela de login.
    expect(onAuthRequired).not.toHaveBeenCalled();
  });

  it('renovação recusada cai no fluxo de login e rejeita', async () => {
    const vistos: (string | undefined)[] = [];
    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);
    setSessionRefresher(vi.fn().mockResolvedValue(null));

    httpClient.defaults.adapter = adapterQue401(1, vistos);

    await expect(httpClient.get('/users/me/products')).rejects.toBeInstanceOf(AxiosError);

    expect(onAuthRequired).toHaveBeenCalledTimes(1);
    // Uma tentativa só: sem token novo não há o que repetir.
    expect(vistos).toHaveLength(1);
  });

  it('renovação que lança é tratada como recusa', async () => {
    const vistos: (string | undefined)[] = [];
    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);
    setSessionRefresher(vi.fn().mockRejectedValue(new Error('rede caiu')));

    httpClient.defaults.adapter = adapterQue401(1, vistos);

    await expect(httpClient.get('/users/me/products')).rejects.toBeInstanceOf(AxiosError);

    expect(onAuthRequired).toHaveBeenCalledTimes(1);
  });

  it('quatro 401 simultâneos renovam uma vez só', async () => {
    const vistos: (string | undefined)[] = [];
    setAuthTokenProvider(() => 'token-velho');
    let liberar: ((valor: string) => void) | undefined;
    const renovar = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          liberar = resolve;
        }),
    );
    setSessionRefresher(renovar);

    httpClient.defaults.adapter = adapterQue401(4, vistos);

    const chamadas = Promise.all([
      httpClient.get('/a'),
      httpClient.get('/b'),
      httpClient.get('/c'),
      httpClient.get('/d'),
    ]);

    // Espera as quatro tomarem 401 antes de liberar a renovação.
    await vi.waitFor(() => expect(renovar).toHaveBeenCalled());
    liberar?.('token-novo');

    const respostas = await chamadas;

    expect(respostas).toHaveLength(4);
    // O backend rotaciona o refresh token: uma segunda renovação usaria um
    // token que a primeira acabou de invalidar, e derrubaria a sessão.
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(vistos.filter((v) => v === 'Bearer token-novo')).toHaveLength(4);
  });

  it('401 que persiste depois da renovação não entra em laço', async () => {
    const vistos: (string | undefined)[] = [];
    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);
    const renovar = vi.fn().mockResolvedValue('token-novo');
    setSessionRefresher(renovar);

    // Nunca deixa de responder 401, mesmo com token novo.
    httpClient.defaults.adapter = adapterQue401(Number.MAX_SAFE_INTEGER, vistos);

    await expect(httpClient.get('/users/me/products')).rejects.toBeInstanceOf(AxiosError);

    expect(renovar).toHaveBeenCalledTimes(1);
    expect(vistos).toHaveLength(2);
    expect(onAuthRequired).toHaveBeenCalledTimes(1);
  });

  it('sem refresher registrado, o 401 vai direto para o login', async () => {
    const vistos: (string | undefined)[] = [];
    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);

    httpClient.defaults.adapter = adapterQue401(1, vistos);

    await expect(httpClient.get('/users/me/products')).rejects.toBeInstanceOf(AxiosError);

    expect(onAuthRequired).toHaveBeenCalledTimes(1);
    expect(vistos).toHaveLength(1);
  });

  it('um 401 de outro code não renova', async () => {
    const renovar = vi.fn().mockResolvedValue('token-novo');
    setSessionRefresher(renovar);

    httpClient.defaults.adapter = unauthorizedAdapter('INVALID_CREDENTIALS');

    await expect(httpClient.post('/auth/login')).rejects.toBeInstanceOf(AxiosError);

    expect(renovar).not.toHaveBeenCalled();
  });
});
