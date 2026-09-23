import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chat, getOutfitSuggestion } from './vintexAiService';
import type { ChatChunk } from '@/types/vintex-ai';

async function collect(iterable: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  return chunks;
}

beforeEach(() => {
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('vintexAiService.chat (mock)', () => {
  it('entrega text* → products → done, nessa ordem', async () => {
    const chunks = await collect(chat({ messages: [{ role: 'user', text: 'quero um look' }] }));

    const types = chunks.map((chunk) => chunk.type);
    const firstProductsIndex = types.indexOf('products');
    const doneIndex = types.indexOf('done');

    expect(types[0]).toBe('text');
    expect(firstProductsIndex).toBeGreaterThan(0);
    expect(types.slice(0, firstProductsIndex).every((type) => type === 'text')).toBe(true);
    expect(doneIndex).toBe(types.length - 1);
    expect(types).toContain('interpreted');
  });

  it('os chunks de products vêm com o shape real de Product, nunca inventado do texto', async () => {
    const chunks = await collect(chat({ messages: [{ role: 'user', text: 'algo' }] }));

    const productsChunk = chunks.find((chunk) => chunk.type === 'products');
    expect(productsChunk).toBeDefined();
    if (productsChunk?.type === 'products') {
      expect(productsChunk.products.length).toBeGreaterThan(0);
      for (const product of productsChunk.products) {
        expect(product).toHaveProperty('id');
        expect(product).toHaveProperty('name');
        expect(product).toHaveProperty('price');
        expect(product).toHaveProperty('store');
      }
    }
  });

  it('abort() interrompe e não emite mais chunks depois disso', async () => {
    const controller = new AbortController();
    const received: ChatChunk[] = [];

    const iterator = chat({
      messages: [{ role: 'user', text: 'algo' }],
      signal: controller.signal,
    });

    // Pega só o primeiro chunk (um pedaço de texto) e aborta em seguida.
    const first = await iterator.next();
    if (!first.done) received.push(first.value);
    controller.abort();

    for await (const chunk of iterator) {
      received.push(chunk);
    }

    expect(received.length).toBeGreaterThan(0);
    expect(received.every((chunk) => chunk.type === 'text')).toBe(true);
    expect(received.some((chunk) => chunk.type === 'done')).toBe(false);
  });

  it('signal já abortado antes de começar não emite nenhum chunk', async () => {
    const controller = new AbortController();
    controller.abort();

    const chunks = await collect(
      chat({ messages: [{ role: 'user', text: 'algo' }], signal: controller.signal }),
    );

    expect(chunks).toHaveLength(0);
  });

  it('modo falha (?mockFail=1) emite um chunk error tipado', async () => {
    window.history.pushState({}, '', '/?mockFail=1');

    const chunks = await collect(chat({ messages: [{ role: 'user', text: 'algo' }] }));

    const errorChunk = chunks.find((chunk) => chunk.type === 'error');
    expect(errorChunk).toBeDefined();
    expect(errorChunk).toMatchObject({ type: 'error', message: expect.any(String) });

    // O stream para no erro: nenhum chunk depois dele.
    const errorIndex = chunks.indexOf(errorChunk!);
    expect(errorIndex).toBe(chunks.length - 1);
    expect(chunks.some((chunk) => chunk.type === 'done')).toBe(false);
  });
});

describe('vintexAiService.getOutfitSuggestion (atalho independente de chat())', () => {
  it('resolve com uma mensagem da Vintex contendo uma sugestão de look', async () => {
    const message = await getOutfitSuggestion('quero um look para um café no domingo');

    expect(message.role).toBe('vintex');
    expect(typeof message.createdAt).toBe('string');
    expect(message.createdAt.length).toBeGreaterThan(0);
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
