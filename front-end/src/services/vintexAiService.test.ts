import { describe, expect, it } from 'vitest';
import { getOutfitSuggestion } from './vintexAiService';

describe('vintexAiService.getOutfitSuggestion', () => {
  it('resolve com uma mensagem da Vintex contendo uma sugestão de look', async () => {
    const message = await getOutfitSuggestion('quero um look para um café no domingo');

    expect(message.role).toBe('vintex');
    expect(message.timestamp).toBe('agora');
    expect(typeof message.text).toBe('string');
    expect(message.text.length).toBeGreaterThan(0);

    expect(message.outfit).toBeDefined();
    expect(message.outfit?.title).toBe('Domingo de garimpo');
    expect(message.outfit?.items).toHaveLength(3);
    expect(message.outfit?.items.map((item) => item.icon)).toEqual(['shirt', 'pants', 'bag']);
  });

  it('gera um id novo (string não vazia) a cada chamada', async () => {
    const first = await getOutfitSuggestion('primeiro prompt');
    const second = await getOutfitSuggestion('segundo prompt');

    expect(typeof first.id).toBe('string');
    expect(first.id.length).toBeGreaterThan(0);
    expect(first.id).not.toBe(second.id);
  });

  it('aceita qualquer prompt, incluindo string vazia (mock ainda não usa o conteúdo)', async () => {
    await expect(getOutfitSuggestion('')).resolves.toBeDefined();
  });
});
