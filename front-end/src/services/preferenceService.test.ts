import { beforeEach, describe, expect, it } from 'vitest';
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
          type: 'style',
          value: expect.any(String),
          label: expect.any(String),
        }),
      ]),
    );
  });

  // Objetivo: garantir o ciclo de substituir, salvar e ler as preferências.
  it('savePreferences substitui as preferências e getPreferences reflete a alteração', async () => {
    const initialPreferences = [
      { type: 'style', value: 'casual' },
      { type: 'style', value: 'vintage' },
    ];

    await savePreferences(initialPreferences);

    expect(await getPreferences()).toEqual(initialPreferences);

    const newPreferences = [{ type: 'style', value: 'streetwear' }];

    await savePreferences(newPreferences);

    expect(await getPreferences()).toEqual(newPreferences);
  });
});
