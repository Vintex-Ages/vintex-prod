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

/** Adapter falso: sempre rejeita como um 401 vindo do backend. */
function unauthorizedAdapter(code: string) {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject(
      new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, null, {
        data: { code, message: 'Sessão expirada.' },
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

  it('no 401 com code AUTH_REQUIRED: guarda a rota de origem e dispara o handler', async () => {
    window.history.pushState({}, '', '/catalogo?q=jaqueta');
    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);
    httpClient.defaults.adapter = unauthorizedAdapter('AUTH_REQUIRED');

    await expect(httpClient.get('/protegido')).rejects.toBeInstanceOf(AxiosError);

    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe('/catalogo?q=jaqueta');
    expect(onAuthRequired).toHaveBeenCalledWith('/catalogo?q=jaqueta');
  });

  it('no 401 sem handler registrado: faz fallback para window.location.assign(/login)', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { pathname: '/perfil', search: '', assign });
    setOnAuthRequired(null);
    httpClient.defaults.adapter = unauthorizedAdapter('AUTH_REQUIRED');

    await expect(httpClient.get('/protegido')).rejects.toBeInstanceOf(AxiosError);

    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('não dispara o fluxo de re-login para um 401 de outro code', async () => {
    const onAuthRequired = vi.fn();
    setOnAuthRequired(onAuthRequired);
    httpClient.defaults.adapter = unauthorizedAdapter('INVALID_CREDENTIALS');

    await expect(httpClient.get('/login')).rejects.toBeInstanceOf(AxiosError);

    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBeNull();
  });
});
