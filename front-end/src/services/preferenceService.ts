import { httpClient } from '@/services/httpClient';
import type { Preference, StyleOption } from '@/types/preference';

const mockStyles: StyleOption[] = [
  { type: 'style', value: 'casual', label: 'Casual' },
  { type: 'style', value: 'vintage', label: 'Vintage' },
  { type: 'style', value: 'streetwear', label: 'Streetwear' },
  { type: 'style', value: 'minimalist', label: 'Minimalista' },
];

let mockPreferences: Preference[] = [];

const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

/**
 * Retorna os estilos disponíveis para seleção.
 * Usa dados mockados enquanto VITE_USE_MOCKS estiver habilitado.
 */
export async function getStyles(): Promise<StyleOption[]> {
  if (useMocks) {
    return [...mockStyles];
  }

  const { data } = await httpClient.get<StyleOption[]>('/styles');
  return data;
}

/**
 * Retorna as preferências atuais do usuário.
 * No mock, uma lista vazia representa um usuário sem preferências definidas.
 */
export async function getPreferences(): Promise<Preference[]> {
  if (useMocks) {
    return [...mockPreferences];
  }

  const { data } = await httpClient.get<Preference[]>('/users/me/preferences');
  return data;
}

/**
 * Substitui todas as preferências atuais do usuário.
 */
export async function savePreferences(prefs: Preference[]): Promise<void> {
  if (useMocks) {
    mockPreferences = [...prefs];
    return;
  }

  await httpClient.put('/users/me/preferences', prefs);
}
