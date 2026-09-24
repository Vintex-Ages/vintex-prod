import { httpClient } from '@/services/httpClient';
import type { Preference, StyleOption } from '@/types/preference';

/**
 * Espelha `app/constants/styles.py` do backend — mesmos `value`, `label` e
 * `description`, e o mesmo `type: 'estilo'`. Os quatro genéricos que estavam
 * aqui ('casual', 'vintage', 'streetwear', 'minimalist') não existem em
 * lugar nenhum do produto: não estão no Figma nem no backend, então o
 * onboarding mockado mostrava uma lista que ninguém desenhou.
 */
const mockStyles: StyleOption[] = [
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
  {
    type: 'estilo',
    value: 'alfaiataria',
    label: 'Alfaiataria & Elegância',
    description: 'Blazers estruturados, camisas de seda e cortes clássicos',
  },
  {
    type: 'estilo',
    value: 'gotico-dark',
    label: 'Gótico & Dark Aesthetic',
    description: 'Tons escuros, coturnos tratorados, rendas e couro',
  },
  {
    type: 'estilo',
    value: 'boho-romantico',
    label: 'Boho Chic & Romântico',
    description: 'Vestidos fluidos, estampas florais e tecidos naturais',
  },
  {
    type: 'estilo',
    value: 'y2k',
    label: 'Y2K Anos 2000',
    description: 'Cintura baixa, bolsas baguete e óculos retrô',
  },
];

let mockPreferences: Preference[] = [];

const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';
const useStylesMocks =
  import.meta.env.VITE_USE_MOCKS_STYLES === undefined
    ? useMocks
    : import.meta.env.VITE_USE_MOCKS_STYLES !== 'false';

interface ApiStylesResponse {
  styles: StyleOption[];
}

/**
 * Retorna os estilos disponíveis para seleção.
 * `VITE_USE_MOCKS_STYLES` sobrescreve o modo global somente nesta operação.
 */
export async function getStyles(): Promise<StyleOption[]> {
  if (useStylesMocks) {
    return [...mockStyles];
  }

  const { data } = await httpClient.get<ApiStylesResponse>('/styles');
  return data.styles;
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
