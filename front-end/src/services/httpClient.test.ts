import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {
  REDIRECT_STORAGE_KEY,
  httpClient,
  setAuthTokenProvider,
  setOnAuthRequired,
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
