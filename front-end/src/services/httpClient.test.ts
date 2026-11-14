import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  REDIRECT_STORAGE_KEY,
  httpClient,
  setAuthTokenProvider,
  setOnAuthRequired,
  setSessionRefresher,
  type RefreshResult,
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
 * Os três resultados do contrato de renovação, tipados de propósito: um
 * `vi.fn().mockResolvedValue(...)` solto é `any` e aceitaria forma errada.
 */
const RENOVADA: RefreshResult = { estado: 'renovada', token: 'token-novo' };
const SESSAO_ENCERRADA: RefreshResult = { estado: 'sessao-encerrada' };
const FALHA_TRANSITORIA: RefreshResult = { estado: 'falha-transitoria' };

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
    const renovar = vi.fn().mockResolvedValue(RENOVADA);
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
    setSessionRefresher(vi.fn().mockResolvedValue(SESSAO_ENCERRADA));

    httpClient.defaults.adapter = adapterQue401(1, vistos);

    await expect(httpClient.get('/users/me/products')).rejects.toBeInstanceOf(AxiosError);

    expect(onAuthRequired).toHaveBeenCalledTimes(1);
    // Uma tentativa só: sem token novo não há o que repetir.
    expect(vistos).toHaveLength(1);
  });

  it('renovação que lança não desloga: vale como falha transitória', async () => {
    const vistos: (string | undefined)[] = [];
    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);
    setSessionRefresher(vi.fn().mockRejectedValue(new Error('rede caiu')));

    httpClient.defaults.adapter = adapterQue401(1, vistos);

    await expect(httpClient.get('/users/me/products')).rejects.toBeInstanceOf(AxiosError);

    // Refresher que estoura é defeito de quem renova, não recusa do backend.
    // Deslogar aqui apagaria a sessão por causa de um bug nosso.
    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(vistos).toHaveLength(1);
  });

  it('falha transitória rejeita a requisição original e mantém a sessão', async () => {
    const vistos: (string | undefined)[] = [];
    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);
    setAuthTokenProvider(() => 'token-velho');
    setSessionRefresher(vi.fn().mockResolvedValue(FALHA_TRANSITORIA));

    httpClient.defaults.adapter = adapterQue401(1, vistos);

    const erro: unknown = await httpClient.get('/users/me/products').then(
      () => null,
      (motivo: unknown) => motivo,
    );

    // O erro da requisição original chega em quem chamou: a tela mostra "não
    // deu, tenta de novo", e não uma tela de login.
    expect(erro).toBeInstanceOf(AxiosError);
    expect((erro as AxiosError).response?.status).toBe(401);
    expect((erro as AxiosError).config?.url).toBe('/users/me/products');

    // Um blip de rede não pode valer o mesmo que refresh token recusado.
    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBeNull();
    // Uma tentativa só: sem token novo não há o que repetir.
    expect(vistos).toHaveLength(1);
  });

  it('a marca de repetição sobrevive à repetição', async () => {
    const vistos: (string | undefined)[] = [];
    const configs: InternalAxiosRequestConfig[] = [];
    const responder = adapterQue401(1, vistos);
    setAuthTokenProvider(() => 'token-velho');
    setSessionRefresher(vi.fn().mockResolvedValue(RENOVADA));

    httpClient.defaults.adapter = (config) => {
      configs.push(config);
      return responder(config);
    };

    await httpClient.get('/users/me/products');

    // O interceptor de request só preserva o token novo se enxergar a marca: o
    // `tokenProvider` ainda devolve o velho, porque o estado React não
    // acompanha a renovação no tempo da repetição.
    expect(vistos).toEqual(['Bearer token-velho', 'Bearer token-novo']);

    // E a marca precisa ser chave própria *string*. O `mergeConfig` do Axios só
    // copia `Symbol` enumerável a partir da 1.19.0, e o `package.json` declara
    // `^1.7.4`: com `Symbol`, uma instalação abaixo de 1.19 perderia a marca
    // aqui e a repetição sairia com o token velho.
    expect(Object.keys(configs[1])).toContain('_vintexJaRenovou');
  });

  it('quatro 401 simultâneos renovam uma vez só', async () => {
    const vistos: (string | undefined)[] = [];
    setAuthTokenProvider(() => 'token-velho');
    let liberar: ((valor: RefreshResult) => void) | undefined;
    const renovar = vi.fn(
      () =>
        new Promise<RefreshResult>((resolve) => {
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
    liberar?.(RENOVADA);

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
    const renovar = vi.fn().mockResolvedValue(RENOVADA);
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
    const renovar = vi.fn().mockResolvedValue(RENOVADA);
    setSessionRefresher(renovar);

    httpClient.defaults.adapter = unauthorizedAdapter('INVALID_CREDENTIALS');

    await expect(httpClient.post('/auth/login')).rejects.toBeInstanceOf(AxiosError);

    expect(renovar).not.toHaveBeenCalled();
  });
});
