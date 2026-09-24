import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreferences, getStyles, savePreferences } from './preferenceService';

describe('preferenceService', () => {
  beforeEach(async () => {
    await savePreferences([]);
  });

  // Objetivo: garantir que o onboarding consiga renderizar sem depender do backend.
  it('getStyles retorna a lista de estilos no mock', async () => {
    const styles = await getStyles();

    expect(styles.length).toBeGreaterThan(0);
    expect(styles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'estilo',
          value: expect.any(String),
          label: expect.any(String),
        }),
      ]),
    );
  });

  // Objetivo: garantir o ciclo de substituir, salvar e ler as preferências.
  it('savePreferences substitui as preferências e getPreferences reflete a alteração', async () => {
    const initialPreferences = [
      { type: 'estilo', value: 'vintage-80-90' },
      { type: 'estilo', value: 'y2k' },
    ];

    await savePreferences(initialPreferences);

    expect(await getPreferences()).toEqual(initialPreferences);

    const newPreferences = [{ type: 'estilo', value: 'streetwear' }];

    await savePreferences(newPreferences);

    expect(await getPreferences()).toEqual(newPreferences);
  });
});

/**
 * Dados reconstruídos a partir do contrato e dos testes do backend em
 * origin/develop@887b24d. Não são uma resposta capturada de uma API em execução.
 */
const BACKEND_STYLES_RESPONSE = {
  styles: [
    {
      type: 'estilo',
      value: 'vintage-80-90',
      label: 'Vintage 80s / 90s',
      description: 'Jaquetas de couro, jeans pesados e peças históricas',
    },
    {
      type: 'estilo',
      value: 'streetwear',
      label: 'Streetwear Urbano',
      description: 'Oversized, moletons gráficos e sneakers raros',
    },
  ],
};

describe('preferenceService.getStyles — contrato do backend 887b24d', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('remove o envelope e preserva type, value, label e description', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getStyles: apiGetStyles } = await import('./preferenceService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: BACKEND_STYLES_RESPONSE,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    await expect(apiGetStyles()).resolves.toEqual(BACKEND_STYLES_RESPONSE.styles);
  });
});

describe('preferenceService.getStyles — seleção explícita mock/API', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('VITE_USE_MOCKS_STYLES=false prevalece sobre o global e envia GET /styles', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');
    vi.stubEnv('VITE_USE_MOCKS_STYLES', 'false');

    const { httpClient } = await import('@/services/httpClient');
    const { getStyles: configuredGetStyles } = await import('./preferenceService');
    const adapter = vi.fn((config) =>
      Promise.resolve({
        data: BACKEND_STYLES_RESPONSE,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }),
    );
    httpClient.defaults.adapter = adapter;

    await configuredGetStyles();

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0]).toMatchObject({ method: 'get', url: '/styles' });
  });

  it('propaga erro HTTP quando estilos reais estão ativos, sem fallback para o catálogo mockado', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');
    vi.stubEnv('VITE_USE_MOCKS_STYLES', 'false');

    const { httpClient } = await import('@/services/httpClient');
    const { getStyles: configuredGetStyles } = await import('./preferenceService');
    const backendError = new Error('falha HTTP dos estilos');
    httpClient.defaults.adapter = () => Promise.reject(backendError);

    await expect(configuredGetStyles()).rejects.toBe(backendError);
  });

  it('getPreferences e savePreferences continuam mockados quando somente estilos usam a API', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');
    vi.stubEnv('VITE_USE_MOCKS_STYLES', 'false');

    const { httpClient } = await import('@/services/httpClient');
    const { getPreferences: configuredGetPreferences, savePreferences: configuredSavePreferences } =
      await import('./preferenceService');
    const adapter = vi.fn(() => Promise.reject(new Error('não deveria chamar HTTP')));
    httpClient.defaults.adapter = adapter;
    const preferences = [{ type: 'estilo', value: 'streetwear' }];

    await configuredSavePreferences(preferences);

    await expect(configuredGetPreferences()).resolves.toEqual(preferences);
    expect(adapter).not.toHaveBeenCalled();
  });

  it('sem override específico herda VITE_USE_MOCKS=true', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');

    const { httpClient } = await import('@/services/httpClient');
    const { getStyles: configuredGetStyles } = await import('./preferenceService');
    const adapter = vi.fn(() => Promise.reject(new Error('não deveria chamar HTTP')));
    httpClient.defaults.adapter = adapter;

    const styles = await configuredGetStyles();

    expect(styles.length).toBeGreaterThan(0);
    expect(adapter).not.toHaveBeenCalled();
  });

  it('VITE_USE_MOCKS_STYLES=true prevalece sobre VITE_USE_MOCKS=false', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    vi.stubEnv('VITE_USE_MOCKS_STYLES', 'true');

    const { httpClient } = await import('@/services/httpClient');
    const { getStyles: configuredGetStyles } = await import('./preferenceService');
    const adapter = vi.fn(() => Promise.reject(new Error('não deveria chamar HTTP')));
    httpClient.defaults.adapter = adapter;

    const styles = await configuredGetStyles();

    expect(styles.length).toBeGreaterThan(0);
    expect(adapter).not.toHaveBeenCalled();
  });
});
