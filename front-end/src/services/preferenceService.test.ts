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

describe('preferenceService (API real)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * O back devolve `{ styles: [...] }` (`StylesResponse`), não a lista solta.
   * Tipar como lista dava 200 e entregava um objeto para a tela: o onboarding
   * ficava em branco, sem erro de rede nenhum, e nenhum teste via porque só o
   * caminho mock era coberto.
   */
  it('getStyles desembrulha a lista de dentro de `styles`', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getStyles: apiGetStyles } = await import('./preferenceService');

    let pedido: string | undefined;
    httpClient.defaults.adapter = (config) => {
      pedido = config.url;
      return Promise.resolve({
        data: {
          styles: [{ type: 'estilo', value: 'y2k', label: 'Y2K', description: 'Anos 2000.' }],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    const styles = await apiGetStyles();

    expect(pedido).toBe('/styles');
    expect(styles).toEqual([
      { type: 'estilo', value: 'y2k', label: 'Y2K', description: 'Anos 2000.' },
    ]);
  });

  it('resposta sem `styles` devolve lista vazia, sem quebrar a tela', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getStyles: apiGetStyles } = await import('./preferenceService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({ data: {}, status: 200, statusText: 'OK', headers: {}, config });

    await expect(apiGetStyles()).resolves.toEqual([]);
  });
});
