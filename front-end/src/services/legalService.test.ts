import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

type LegalServiceModule = typeof import('./legalService');

let legalService: LegalServiceModule;
let httpClientRef: AxiosInstance;

describe('legalService (mock, VITE_USE_MOCKS padrão)', () => {
  beforeEach(async () => {
    vi.resetModules();
    legalService = await import('./legalService');
  });

  // Objetivo: garantir os dois artefatos jurídicos distintos (RN-93).
  it('getTerms e getSellerContract devolvem documentos com versões distintas', async () => {
    const terms = await legalService.getTerms();
    const contract = await legalService.getSellerContract();

    expect(terms.version).not.toBe(contract.version);
  });

  it('o texto do mock está marcado como provisório', async () => {
    const terms = await legalService.getTerms();
    const contract = await legalService.getSellerContract();

    expect(terms.content).toContain('PROVISÓRIO');
    expect(contract.content).toContain('PROVISÓRIO');
  });
});

describe('legalService (API real, VITE_USE_MOCKS=false)', () => {
  beforeEach(async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    vi.resetModules();
    legalService = await import('./legalService');
    httpClientRef = (await import('./httpClient')).httpClient;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getTerms chama GET /legal/terms e converte document_type para kind', async () => {
    let requestedUrl: string | undefined;
    httpClientRef.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      requestedUrl = config.url;
      return Promise.resolve({
        data: {
          document_type: 'termos_uso',
          version: 'v1',
          content: 'Texto dos termos',
          published_at: '2026-09-20T00:00:00Z',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    await expect(legalService.getTerms()).resolves.toEqual({
      kind: 'terms',
      version: 'v1',
      content: 'Texto dos termos',
      publishedAt: '2026-09-20T00:00:00Z',
    });
    expect(requestedUrl).toBe('/legal/terms');
  });

  it('getSellerContract chama GET /legal/seller-contract e converte contrato_venda', async () => {
    let requestedUrl: string | undefined;
    httpClientRef.defaults.adapter = (config: InternalAxiosRequestConfig) => {
      requestedUrl = config.url;
      return Promise.resolve({
        data: {
          document_type: 'contrato_venda',
          version: 'v1',
          content: 'Texto do contrato',
          published_at: '2026-09-20T00:00:00Z',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    await expect(legalService.getSellerContract()).resolves.toMatchObject({
      kind: 'seller-contract',
    });
    expect(requestedUrl).toBe('/legal/seller-contract');
  });

  it('404 LEGAL_DOCUMENT_NOT_FOUND vira LegalError com o mesmo code', async () => {
    httpClientRef.defaults.adapter = (config: InternalAxiosRequestConfig) =>
      Promise.reject(
        new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
          data: {
            error: { code: 'LEGAL_DOCUMENT_NOT_FOUND', message: 'Documento não encontrado.' },
          },
          status: 404,
          statusText: 'Not Found',
          headers: {},
          config,
        }),
      );

    await expect(legalService.getTerms()).rejects.toMatchObject({
      name: 'LegalError',
      code: 'LEGAL_DOCUMENT_NOT_FOUND',
    });
  });
});
