import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { PriceSuggestion, PriceSuggestionInput } from '@/types/vintex-ai';
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

  it('modo falha comum (?mockFail=1) não marca o erro como cota', async () => {
    window.history.pushState({}, '', '/?mockFail=1');

    const chunks = await collect(chat({ messages: [{ role: 'user', text: 'algo' }] }));

    expect(chunks.at(-1)).not.toHaveProperty('reason');
  });

  it('modo cota (?mockQuota=1) emite só o chunk de erro de cota', async () => {
    window.history.pushState({}, '', '/?mockQuota=1');

    const chunks = await collect(chat({ messages: [{ role: 'user', text: 'algo' }] }));

    expect(chunks).toEqual([{ type: 'error', reason: 'quota', message: expect.any(String) }]);
  });

  it('modo cota com signal já abortado não emite nada', async () => {
    window.history.pushState({}, '', '/?mockQuota=1');
    const controller = new AbortController();
    controller.abort();

    const chunks = await collect(
      chat({ messages: [{ role: 'user', text: 'algo' }], signal: controller.signal }),
    );

    expect(chunks).toHaveLength(0);
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

/**
 * Contrato de rede do `POST /api/ai/chat` (back-end#149). O arquivo do service
 * dizia "sem teste automatizado: não há endpoint pra testar contra ainda", e
 * enquanto foi verdade os três pontos em que o front divergia do back passaram
 * sem ninguém ver: o papel `vintex` no corpo (que o back recusa com 422 a
 * partir da segunda pergunta), o item de peça em snake_case e o evento
 * `interpreted` plano. O endpoint existe desde 21/09, então aqui o contrato
 * fica preso por teste, com `fetch` dublado.
 */

function sse(...eventos: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const evento of eventos) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evento)}\n\n`));
      }
      controller.close();
    },
  });
}

function respostaOk(body: ReadableStream<Uint8Array>): Response {
  return { ok: true, status: 200, body } as unknown as Response;
}

async function coletar(request: Parameters<typeof chat>[0]) {
  const { chat: chatReal } = await import('./vintexAiService');
  return collect(chatReal(request));
}

const PECA_DO_BACK = {
  id: 42,
  name: 'Jaqueta de couro',
  price: 259.9,
  cover_image_url: 'https://exemplo.test/jaqueta.jpg',
  store: { id: 7, name: 'Brechó da Ana' },
};

describe('vintexAiService.chat (API real)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    // Base com `/api` no fim, como o `.env.example` manda: e o que revela a
    // URL dobrada, que `toContain` nao revelava.
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/api');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('monta a URL do chat sem dobrar o /api da base', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(sse({ type: 'done' })));
    vi.stubGlobal('fetch', fetchMock);

    await coletar({ messages: [{ role: 'user', text: 'oi' }] });

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://api.test/api/ai/chat');
  });

  it('converte o papel `vintex` em `assistant`, que é o que o back aceita', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(sse({ type: 'done' })));
    vi.stubGlobal('fetch', fetchMock);

    await coletar({
      messages: [
        { role: 'user', text: 'bolsa vermelha' },
        { role: 'vintex', text: 'achei estas' },
        { role: 'user', text: 'e em preto?' },
      ],
    });

    const corpo = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(corpo.messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
  });

  it('mapeia o item de peça do back para o Product do front', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respostaOk(sse({ type: 'products', products: [PECA_DO_BACK] }))),
    );

    const chunks = await coletar({ messages: [{ role: 'user', text: 'jaqueta' }] });

    expect(chunks[0]).toEqual({
      type: 'products',
      products: [
        {
          id: '42',
          name: 'Jaqueta de couro',
          price: 259.9,
          coverImageUrl: 'https://exemplo.test/jaqueta.jpg',
          store: {
            id: '7',
            name: 'Brechó da Ana',
            city: undefined,
            verified: undefined,
            logoUrl: undefined,
          },
        },
      ],
    });
  });

  it('devolve o evento `interpreted` aninhado, como o tipo do front declara', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          respostaOk(
            sse({ type: 'interpreted', filters: { category: 'Roupas' }, similarity: 'boho' }),
          ),
        ),
    );

    const chunks = await coletar({ messages: [{ role: 'user', text: 'algo boho' }] });

    expect(chunks[0]).toEqual({
      type: 'interpreted',
      interpreted: { filters: { category: 'Roupas' }, similarity: 'boho' },
    });
  });

  it('falha de rede vira chunk de erro, nunca exceção para quem itera', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const chunks = await coletar({ messages: [{ role: 'user', text: 'bolsa' }] });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
  });

  it('abortar encerra o gerador em silêncio, sem chunk de erro', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }),
    );

    const chunks = await coletar({
      messages: [{ role: 'user', text: 'bolsa' }],
      signal: controller.signal,
    });

    expect(chunks).toEqual([]);
  });

  it('ignora evento de tipo desconhecido em vez de quebrar a tela', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respostaOk(sse({ type: 'reranked' }, { type: 'done' }))),
    );

    const chunks = await coletar({ messages: [{ role: 'user', text: 'bolsa' }] });

    expect(chunks).toEqual([{ type: 'done' }]);
  });

  it('evento de erro com code quota_exceeded vira reason quota, com o retryAt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respostaOk(
          sse({
            type: 'error',
            code: 'quota_exceeded',
            message: 'Limite diário atingido.',
            retry_at: '2026-10-09T03:00:00Z',
          }),
        ),
      ),
    );

    const chunks = await coletar({ messages: [{ role: 'user', text: 'bolsa' }] });

    expect(chunks).toEqual([
      {
        type: 'error',
        reason: 'quota',
        message: 'Limite diário atingido.',
        retryAt: '2026-10-09T03:00:00Z',
      },
    ]);
  });

  it('erro de cota sem retry_at não inventa retryAt', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          respostaOk(sse({ type: 'error', code: 'quota_exceeded', message: 'Limite diário.' })),
        ),
    );

    const chunks = await coletar({ messages: [{ role: 'user', text: 'bolsa' }] });

    expect(chunks).toEqual([{ type: 'error', reason: 'quota', message: 'Limite diário.' }]);
  });

  it('evento de erro sem code (ou com outro code) continua sem reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          respostaOk(
            sse(
              { type: 'error', message: 'Provedor fora do ar.' },
              { type: 'error', code: 'ai_unavailable', message: 'Outro.' },
            ),
          ),
        ),
    );

    const chunks = await coletar({ messages: [{ role: 'user', text: 'bolsa' }] });

    expect(chunks).toEqual([
      { type: 'error', message: 'Provedor fora do ar.' },
      { type: 'error', message: 'Outro.' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// suggestListing (FE-SVC-vintex-ai-listing, #200)
// ---------------------------------------------------------------------------

describe('suggestListing (mock)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');
  });

  it('devolve os campos e a lista do que veio da IA', async () => {
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['foto-frente.jpg'] });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestion.fields.category).toBe('Jaquetas');
    expect(r.suggestion.suggested).toEqual([
      'category',
      'color',
      'size',
      'condition',
      'description',
    ]);
  });

  // RN-58: a IA não chuta marca. Sem etiqueta legível, `brand` não vem e a
  // ausência é dita em `notes`, para a tela poder explicar em vez de só omitir.
  it('sem etiqueta na foto não sugere marca, e registra o motivo', async () => {
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['foto-frente.jpg'] });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestion.suggested).not.toContain('brand');
    expect(r.suggestion.fields.brand).toBeUndefined();
    expect(r.suggestion.notes?.join(' ')).toMatch(/etiqueta/i);
  });

  it('com etiqueta na foto sugere a marca', async () => {
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['foto-frente.jpg', 'foto-etiqueta.jpg'] });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestion.suggested).toContain('brand');
    expect(r.suggestion.fields.brand).toBe('Zara');
  });

  it('modo falha devolve ok:false com motivo, sem lançar (RN-57)', async () => {
    window.history.pushState({}, '', '/?mockFail=1');
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['foto.jpg'] });

    expect(r).toEqual({ ok: false, reason: 'unavailable', message: expect.any(String) });
  });

  it('timeout curto devolve reason timeout, para a IA lenta não travar a tela', async () => {
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['foto.jpg'] }, { timeoutMs: 10 });

    expect(r).toEqual({ ok: false, reason: 'timeout', message: expect.any(String) });
  });

  it('recusa antes de chamar quando passa do limite de fotos do back', async () => {
    const { suggestListing } = await import('./vintexAiService');
    const nove = Array.from({ length: 9 }, (_, i) => `foto-${i}.jpg`);

    const r = await suggestListing({ imageUrls: nove });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('invalid-image');
    expect(r.message).toContain('8');
  });

  it('sem foto nenhuma recusa como foto inválida', async () => {
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: [] });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('invalid-image');
  });

  // #318: foto de etiqueta separada. A legibilidade dela decide marca e
  // composição juntas, porque as duas saem do mesmo pedaço de pano.
  it('etiqueta legível sugere marca e composição', async () => {
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({
      imageUrls: ['foto-frente.jpg'],
      labelImage: new File(['e'], 'minha-etiqueta.jpg', { type: 'image/jpeg' }),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestion.suggested).toContain('brand');
    expect(r.suggestion.suggested).toContain('composition');
    expect(r.suggestion.fields.brand).toBeTruthy();
    expect(r.suggestion.fields.composition).toBeTruthy();
    expect(r.suggestion.notes).toBeUndefined();
  });

  // RN-59: etiqueta ilegível não vira chute; a tela recebe o motivo.
  it('etiqueta ilegível não sugere marca nem composição, e registra o motivo', async () => {
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({
      imageUrls: ['foto-frente.jpg', 'foto-etiqueta.jpg'],
      labelImage: new File(['e'], 'etiqueta-ilegivel.jpg', { type: 'image/jpeg' }),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestion.suggested).not.toContain('brand');
    expect(r.suggestion.suggested).not.toContain('composition');
    expect(r.suggestion.fields.brand).toBeUndefined();
    expect(r.suggestion.fields.composition).toBeUndefined();
    const notes = r.suggestion.notes?.join(' ') ?? '';
    expect(notes).toMatch(/ilegível/i);
    expect(notes).toMatch(/composição/i);
  });

  it('sem foto de etiqueta nunca sugere composição', async () => {
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['foto-frente.jpg', 'foto-etiqueta.jpg'] });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestion.suggested).not.toContain('composition');
    expect(r.suggestion.fields.composition).toBeUndefined();
  });
});

describe('suggestListing (API real)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    // Base com `/api` no fim, como o `.env.example` manda: e o que revela a
    // URL dobrada, que `toContain` nao revelava.
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/api');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function respostaJson(dados: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(dados),
    } as unknown as Response;
  }

  it('manda image_urls em snake_case e traduz o ImageAnalysisResult do back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respostaJson({
        category: { value: 'Jaquetas', confidence: 0.9 },
        color: { value: 'Preto', confidence: null },
        size: null,
        condition: null,
        description: null,
        brand: { value: 'Zara', confidence: 0.5 },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['https://x.test/a.jpg'] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://api.test/api/ai/listing-suggestions');
    expect(JSON.parse(init.body as string)).toEqual({ image_urls: ['https://x.test/a.jpg'] });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestion.suggested).toEqual(['category', 'color', 'brand']);
    expect(r.suggestion.confidence).toEqual({ category: 0.9, brand: 0.5 });
  });

  // A rota síncrona devolve 200 com tudo nulo quando a IA falha, então o front
  // não tem como chamar de indisponível: informa que nada foi identificado.
  it('resposta com todos os campos nulos vira sucesso sem nenhum campo sugerido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaJson({})));
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['https://x.test/a.jpg'] });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestion.suggested).toEqual([]);
    expect(r.suggestion.notes?.join(' ')).toMatch(/não identificamos/i);
  });

  /**
   * O back distingue "provedor fora do ar" (503) de "a IA respondeu e não viu
   * nada" (200 vazio). A mensagem tem que distinguir também: dizer que a foto
   * é ilegível quando o Gemini caiu joga a culpa no vendedor e sugere trocar a
   * foto, quando a ação certa é tentar de novo.
   */
  it('503 avisa que a IA está fora do ar, e manda tentar de novo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaJson({}, 503)));
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['https://x.test/a.jpg'] });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('unavailable');
    expect(r.message).toMatch(/tente de novo/i);
    expect(r.message).not.toMatch(/outra foto/i);
  });

  it('422 do back vira invalid-image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaJson({}, 422)));
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['https://x.test/a.jpg'] });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('invalid-image');
  });

  it('falha de rede vira unavailable, nunca exceção (RN-57)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['https://x.test/a.jpg'] });

    expect(r).toEqual({ ok: false, reason: 'unavailable', message: expect.any(String) });
  });

  it('com productId consulta o pipeline e devolve o que ele já concluiu', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      respostaJson({
        status: 'done',
        error: null,
        suggestions: { color: { value: 'Verde' } },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['https://x.test/a.jpg'], productId: '42' });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://api.test/api/users/me/products/42/ai-status',
    );
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suggestion.fields.color).toBe('Verde');
  });

  it('pipeline com status failed vira unavailable com a mensagem do back', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(respostaJson({ status: 'failed', error: 'Provedor recusou a imagem.' })),
    );
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing({ imageUrls: ['https://x.test/a.jpg'], productId: '42' });

    expect(r).toEqual({
      ok: false,
      reason: 'unavailable',
      message: 'Provedor recusou a imagem.',
    });
  });

  describe('com foto de etiqueta (#318)', () => {
    const etiqueta = new File(['e'], 'etiqueta.jpg', { type: 'image/jpeg' });

    function stubUpload(impl: () => Promise<string[]>) {
      const uploadMedia = vi.fn(impl);
      vi.doMock('@/services/sellerProductService', () => ({ uploadMedia }));
      return uploadMedia;
    }

    afterEach(() => {
      vi.doUnmock('@/services/sellerProductService');
    });

    it('sobe a etiqueta como label e manda label_image_url no corpo', async () => {
      const uploadMedia = stubUpload(() => Promise.resolve(['https://api.test/m/etiqueta.jpg']));
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          respostaJson({ composition: { value: '100% algodão', confidence: 0.8 } }),
        );
      vi.stubGlobal('fetch', fetchMock);
      const { suggestListing } = await import('./vintexAiService');

      const r = await suggestListing({
        imageUrls: ['https://x.test/a.jpg'],
        labelImage: etiqueta,
      });

      expect(uploadMedia).toHaveBeenCalledWith([etiqueta], 'label');
      expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
        image_urls: ['https://x.test/a.jpg'],
        label_image_url: 'https://api.test/m/etiqueta.jpg',
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.suggestion.fields.composition).toBe('100% algodão');
      expect(r.suggestion.suggested).toContain('composition');
    });

    it('sem etiqueta não sobe nada e o corpo fica igual ao de antes', async () => {
      const uploadMedia = stubUpload(() => Promise.resolve(['nunca']));
      const fetchMock = vi.fn().mockResolvedValue(respostaJson({}));
      vi.stubGlobal('fetch', fetchMock);
      const { suggestListing } = await import('./vintexAiService');

      await suggestListing({ imageUrls: ['https://x.test/a.jpg'] });

      expect(uploadMedia).not.toHaveBeenCalled();
      expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
        image_urls: ['https://x.test/a.jpg'],
      });
    });

    it('upload sem URL de volta não manda label_image_url', async () => {
      stubUpload(() => Promise.resolve([]));
      const fetchMock = vi.fn().mockResolvedValue(respostaJson({}));
      vi.stubGlobal('fetch', fetchMock);
      const { suggestListing } = await import('./vintexAiService');

      await suggestListing({ imageUrls: ['https://x.test/a.jpg'], labelImage: etiqueta });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
        image_urls: ['https://x.test/a.jpg'],
      });
    });

    it('falha no upload da etiqueta vira unavailable, sem lançar e sem chamar a IA', async () => {
      stubUpload(() => Promise.reject(new Error('rede fora')));
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { suggestListing } = await import('./vintexAiService');

      const r = await suggestListing({ imageUrls: ['https://x.test/a.jpg'], labelImage: etiqueta });

      expect(r).toEqual({ ok: false, reason: 'unavailable', message: expect.any(String) });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('upload da etiqueta que passa do prazo vira timeout', async () => {
      stubUpload(() => new Promise<string[]>(() => {}));
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { suggestListing } = await import('./vintexAiService');

      const r = await suggestListing(
        { imageUrls: ['https://x.test/a.jpg'], labelImage: etiqueta },
        { timeoutMs: 20 },
      );

      expect(r).toEqual({ ok: false, reason: 'timeout', message: expect.any(String) });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('cancelar durante o upload da etiqueta interrompe sem chamar a IA', async () => {
      stubUpload(() => new Promise<string[]>(() => {}));
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { suggestListing } = await import('./vintexAiService');
      const controller = new AbortController();

      const pendente = suggestListing(
        { imageUrls: ['https://x.test/a.jpg'], labelImage: etiqueta },
        { signal: controller.signal },
      );
      controller.abort();
      const r = await pendente;

      expect(r).toEqual({ ok: false, reason: 'unavailable', message: expect.any(String) });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('pipeline que não sai de processing esgota o prazo e vira timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaJson({ status: 'processing' })));
    const { suggestListing } = await import('./vintexAiService');

    const r = await suggestListing(
      { imageUrls: ['https://x.test/a.jpg'], productId: '42' },
      { timeoutMs: 30 },
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('timeout');
  });
});

// ---------------------------------------------------------------------------
// suggestPrice (FE-SVC-vintex-ai-price, #314; contrato back-end#254)
// ---------------------------------------------------------------------------

const PRICE_INPUT = {
  name: 'Jaqueta jeans',
  category: 'Roupas',
  condition: 'Seminovo',
};

const PRICE_API_RESPONSE = {
  min: 89.9,
  max: 149.9,
  justification: 'Sugestão baseada no catálogo.',
  based_on: 6,
};

const PRICE_SUGGESTION = {
  min: 89.9,
  max: 149.9,
  justification: 'Sugestão baseada no catálogo.',
  basedOn: 6,
};

function priceResponseAdapter(data: unknown = PRICE_API_RESPONSE) {
  return vi.fn((config: InternalAxiosRequestConfig) =>
    Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config }),
  );
}

describe('suggestPrice (#314)', () => {
  let priceService: typeof import('./vintexAiService');
  let http: typeof import('./httpClient');
  let originalAdapter: AxiosInstance['defaults']['adapter'];
  let adapter: ReturnType<typeof priceResponseAdapter>;
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
  let authRequired: ReturnType<typeof vi.fn<(from: string) => void>>;
  let originalRedirect: string | null;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/api');

    http = await import('./httpClient');
    priceService = await import('./vintexAiService');
    originalAdapter = http.httpClient.defaults.adapter;
    originalRedirect = window.sessionStorage.getItem(http.REDIRECT_STORAGE_KEY);
    adapter = priceResponseAdapter();
    http.httpClient.defaults.adapter = adapter;
    http.setAuthTokenProvider(() => null);
    http.setSessionRefresher(null);
    authRequired = vi.fn<(from: string) => void>();
    http.setOnAuthRequired(authRequired);

    // Impede chamadas reais também se uma implementação usar fetch indevidamente.
    fetchSpy = vi.fn<typeof fetch>().mockRejectedValue(new Error('fetch inesperado na sugestão'));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    http.httpClient.defaults.adapter = originalAdapter;
    http.setAuthTokenProvider(() => null);
    http.setSessionRefresher(null);
    http.setOnAuthRequired(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    window.history.pushState({}, '', '/');

    if (originalRedirect === null) {
      window.sessionStorage.removeItem(http.REDIRECT_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(http.REDIRECT_STORAGE_KEY, originalRedirect);
    }
  });

  function rejectHttp(status: number, code = 'INTERNAL_ERROR') {
    adapter.mockImplementationOnce((config) =>
      Promise.reject(
        new AxiosError('Requisição recusada', 'ERR_BAD_RESPONSE', config, null, {
          data: {
            error: {
              code,
              message: 'Não foi possível sugerir o preço.',
              return_to: '/seller/products/new?step=price',
            },
          },
          status,
          statusText: 'Error',
          headers: {},
          config,
        }),
      ),
    );
  }

  async function resolveMock(input: PriceSuggestionInput = PRICE_INPUT): Promise<PriceSuggestion> {
    const pending = priceService.suggestPrice(input);
    // Observa a Promise imediatamente, inclusive se uma implementação incorreta rejeitar.
    const [result] = await Promise.all([pending, vi.advanceTimersByTimeAsync(400)]);
    return result;
  }

  it('exporta suggestPrice com name obrigatório e o retorno público aprovado', () => {
    expect(priceService.suggestPrice).toBeTypeOf('function');
    expectTypeOf<PriceSuggestionInput>().toMatchTypeOf<{ name: string }>();
    expectTypeOf<{ name: string }>().toMatchTypeOf<PriceSuggestionInput>();
    expectTypeOf<Omit<PriceSuggestionInput, 'name'>>().not.toMatchTypeOf<PriceSuggestionInput>();
    expectTypeOf<typeof priceService.suggestPrice>().toEqualTypeOf<
      (input: PriceSuggestionInput) => Promise<PriceSuggestion>
    >();
  });

  it('exporta PriceSuggestionError', () => {
    expect(priceService.PriceSuggestionError).toBeTypeOf('function');
  });

  describe('contrato HTTP e mapeamento', () => {
    it.each(['http://api.test/api', 'http://api.test/api/'])(
      'faz um POST na URL final correta com base %s',
      async (baseURL) => {
        http.httpClient.defaults.baseURL = baseURL;

        await priceService.suggestPrice(PRICE_INPUT);

        expect(adapter).toHaveBeenCalledTimes(1);
        const config = adapter.mock.calls[0][0];
        expect(config.method).toBe('post');
        expect(config.url).toBe('/ai/price-suggestions');
        expect(http.httpClient.getUri(config)).toBe('http://api.test/api/ai/price-suggestions');
        expect(fetchSpy).not.toHaveBeenCalled();
      },
    );

    it('envia somente name quando nenhum campo opcional foi fornecido', async () => {
      await priceService.suggestPrice({ name: 'Peça sem detalhes' });

      expect(adapter).toHaveBeenCalledTimes(1);
      expect(JSON.parse(adapter.mock.calls[0][0].data as string)).toEqual({
        name: 'Peça sem detalhes',
      });
    });

    it('envia os seis campos permitidos e ignora productId e propriedades inesperadas', async () => {
      const input = {
        ...PRICE_INPUT,
        productId: 'rascunho-42',
        brand: "Levi's",
        size: 'M',
        description: 'Jaqueta jeans azul em bom estado.',
        price: 999,
        unexpected: 'não enviar',
      };

      await priceService.suggestPrice(input);

      expect(adapter).toHaveBeenCalledTimes(1);
      expect(adapter.mock.calls[0][0].url).toBe('/ai/price-suggestions');
      expect(JSON.parse(adapter.mock.calls[0][0].data as string)).toEqual({
        name: input.name,
        category: input.category,
        brand: input.brand,
        condition: input.condition,
        size: input.size,
        description: input.description,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('omite todos os opcionais undefined do JSON enviado', async () => {
      await priceService.suggestPrice({
        name: 'Peça',
        productId: undefined,
        category: undefined,
        brand: undefined,
        condition: undefined,
        size: undefined,
        description: undefined,
      });

      expect(adapter).toHaveBeenCalledTimes(1);
      expect(JSON.parse(adapter.mock.calls[0][0].data as string)).toEqual({ name: 'Peça' });
    });

    it('mapeia o objeto individual do backend e preserva os valores numéricos em reais', async () => {
      const suggestion = await priceService.suggestPrice(PRICE_INPUT);

      expect(suggestion).toEqual(PRICE_SUGGESTION);
      expect(typeof suggestion.min).toBe('number');
      expect(typeof suggestion.max).toBe('number');
    });

    it('converte strings decimais para números em reais, sem conversão para centavos', async () => {
      adapter.mockImplementationOnce(
        priceResponseAdapter({
          ...PRICE_API_RESPONSE,
          min: '89.90',
          max: '149.90',
        }),
      );

      const suggestion = await priceService.suggestPrice(PRICE_INPUT);

      expect(suggestion).toEqual(PRICE_SUGGESTION);
      expect(typeof suggestion.min).toBe('number');
      expect(typeof suggestion.max).toBe('number');
    });

    it('resolve normalmente quando HTTP 200 informa ausência de comparáveis', async () => {
      adapter.mockImplementationOnce(
        priceResponseAdapter({
          min: null,
          max: null,
          justification: 'Não há comparáveis suficientes.',
          based_on: 0,
        }),
      );

      await expect(priceService.suggestPrice(PRICE_INPUT)).resolves.toEqual({
        min: null,
        max: null,
        justification: 'Não há comparáveis suficientes.',
        basedOn: 0,
      });
    });

    it('não grava a sugestão nem realiza outra operação HTTP após obter o preço', async () => {
      const storageWrite = vi.spyOn(Storage.prototype, 'setItem');

      await priceService.suggestPrice(PRICE_INPUT);

      expect(adapter).toHaveBeenCalledTimes(1);
      expect(adapter.mock.calls[0][0].method).toBe('post');
      expect(adapter.mock.calls[0][0].url).toBe('/ai/price-suggestions');
      expect(storageWrite).not.toHaveBeenCalled();
    });

    it('herda Authorization Bearer e X-Return-To do httpClient', async () => {
      http.setAuthTokenProvider(() => 'token-preco');
      window.history.pushState({}, '', '/seller/products/new?step=price');

      await priceService.suggestPrice(PRICE_INPUT);

      expect(adapter).toHaveBeenCalledTimes(1);
      const config = adapter.mock.calls[0][0];
      expect(config.headers.get('Authorization')).toBe('Bearer token-preco');
      expect(config.headers.get('X-Return-To')).toBe('/seller/products/new?step=price');
    });

    it('respeita a renovação e repetição da requisição feita pelo interceptor', async () => {
      http.setAuthTokenProvider(() => 'token-antigo');
      const refresher = vi.fn().mockResolvedValue({ estado: 'renovada', token: 'token-renovado' });
      http.setSessionRefresher(refresher);
      rejectHttp(401, 'AUTH_REQUIRED');

      await expect(priceService.suggestPrice(PRICE_INPUT)).resolves.toEqual(PRICE_SUGGESTION);

      expect(refresher).toHaveBeenCalledTimes(1);
      expect(adapter).toHaveBeenCalledTimes(2);
      expect(adapter.mock.calls[1][0].headers.get('Authorization')).toBe('Bearer token-renovado');
      expect(authRequired).not.toHaveBeenCalled();
    });
  });

  describe('erros tipados', () => {
    it('401 AUTH_REQUIRED rejeita com erro tipado e preserva o fluxo de autenticação', async () => {
      rejectHttp(401, 'AUTH_REQUIRED');

      const pending = priceService.suggestPrice(PRICE_INPUT);

      await expect(pending).rejects.toBeInstanceOf(priceService.PriceSuggestionError);
      await expect(pending).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
      expect(authRequired).toHaveBeenCalledTimes(1);
      expect(authRequired).toHaveBeenCalledWith('/seller/products/new?step=price');
      expect(window.sessionStorage.getItem(http.REDIRECT_STORAGE_KEY)).toBe(
        '/seller/products/new?step=price',
      );
    });

    it.each([
      { status: 422, backendCode: 'VALIDATION_ERROR', expected: 'VALIDATION_ERROR' },
      { status: 500, backendCode: 'INTERNAL_ERROR', expected: 'SERVER_ERROR' },
      { status: 503, backendCode: 'INTERNAL_ERROR', expected: 'SERVER_ERROR' },
      { status: 409, backendCode: 'CONFLICT', expected: 'HTTP_ERROR' },
    ])('HTTP $status rejeita como $expected', async ({ status, backendCode, expected }) => {
      rejectHttp(status, backendCode);

      const pending = priceService.suggestPrice(PRICE_INPUT);

      await expect(pending).rejects.toBeInstanceOf(priceService.PriceSuggestionError);
      await expect(pending).rejects.toMatchObject({ code: expected, status });
      expect(authRequired).not.toHaveBeenCalled();
    });

    it('falha de rede rejeita como NETWORK_ERROR, em vez de resolver com faixa nula', async () => {
      adapter.mockImplementationOnce((config) =>
        Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', config)),
      );

      const pending = priceService.suggestPrice(PRICE_INPUT);

      await expect(pending).rejects.toBeInstanceOf(priceService.PriceSuggestionError);
      await expect(pending).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
      expect(authRequired).not.toHaveBeenCalled();
    });

    it.each([
      { field: 'min', value: 'preço ilegível' },
      { field: 'max', value: '149,90' },
      { field: 'min', value: '' },
      { field: 'max', value: ' ' },
      { field: 'min', value: 'Infinity' },
    ])('rejeita $field=$value como INVALID_RESPONSE', async ({ field, value }) => {
      adapter.mockImplementationOnce(
        priceResponseAdapter({
          ...PRICE_API_RESPONSE,
          [field]: value,
        }),
      );

      const pending = priceService.suggestPrice(PRICE_INPUT);

      await expect(pending).rejects.toBeInstanceOf(priceService.PriceSuggestionError);
      await expect(pending).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });
  });

  describe('validação da resposta HTTP', () => {
    it('rejeita HTTP 200 com formato geral inválido', async () => {
      adapter.mockImplementationOnce(priceResponseAdapter(null));

      const pending = priceService.suggestPrice(PRICE_INPUT);

      await expect(pending).rejects.toBeInstanceOf(priceService.PriceSuggestionError);
      await expect(pending).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('rejeita HTTP 200 com justification null', async () => {
      adapter.mockImplementationOnce(
        priceResponseAdapter({
          ...PRICE_API_RESPONSE,
          justification: null,
        }),
      );

      const pending = priceService.suggestPrice(PRICE_INPUT);

      await expect(pending).rejects.toBeInstanceOf(priceService.PriceSuggestionError);
      await expect(pending).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });

    it('rejeita HTTP 200 com based_on inválido', async () => {
      adapter.mockImplementationOnce(
        priceResponseAdapter({
          ...PRICE_API_RESPONSE,
          based_on: 'valor-invalido',
        }),
      );

      const pending = priceService.suggestPrice(PRICE_INPUT);

      await expect(pending).rejects.toBeInstanceOf(priceService.PriceSuggestionError);
      await expect(pending).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });
  });

  describe('mock determinístico', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_USE_MOCKS', 'true');
      vi.useFakeTimers();
    });

    it('entradas iguais produzem a mesma sugestão em objetos independentes', async () => {
      const first = await resolveMock(PRICE_INPUT);
      const second = await resolveMock({ ...PRICE_INPUT });

      expect(second).toEqual(first);
      expect(second).not.toBe(first);
      expect(first).toMatchObject({ min: 89.9, max: 149.9, basedOn: 6 });
      expect(first.justification.trim().length).toBeGreaterThan(0);
    });

    it.each([
      { category: 'Roupas', min: 89.9, max: 149.9, basedOn: 6 },
      { category: 'Acessórios', min: 49.9, max: 99.9, basedOn: 4 },
      { category: 'Sapatos', min: 119.9, max: 189.9, basedOn: 5 },
    ])(
      'usa a faixa aprovada para $category / Seminovo',
      async ({ category, min, max, basedOn }) => {
        const suggestion = await resolveMock({ ...PRICE_INPUT, category });

        expect(suggestion).toMatchObject({ min, max, basedOn });
        expect(suggestion.justification.trim().length).toBeGreaterThan(0);
      },
    );

    it.each([
      { condition: 'Novo com etiqueta', min: 109.9, max: 179.9 },
      { condition: 'Usado', min: 69.9, max: 119.9 },
      { condition: 'Marcas de uso', min: 49.9, max: 89.9 },
    ])('diferencia a condição $condition em Roupas', async ({ condition, min, max }) => {
      const suggestion = await resolveMock({ ...PRICE_INPUT, condition });

      expect(suggestion).toMatchObject({ min, max, basedOn: 6 });
    });

    it.each([
      { name: 'Peça sem detalhes' },
      { name: 'Peça', category: 'Categoria desconhecida', condition: 'Condição desconhecida' },
      { name: 'Peça', category: undefined, condition: undefined },
    ])('usa o fallback Roupas / Seminovo para $name', async (input) => {
      const suggestion = await resolveMock(input);

      expect(suggestion).toMatchObject({ min: 89.9, max: 149.9, basedOn: 6 });
      expect(suggestion.justification.trim().length).toBeGreaterThan(0);
    });

    it('permanece pendente aos 399 ms e resolve após os 400 ms de latência', async () => {
      const pending = priceService.suggestPrice(PRICE_INPUT);
      const settled = vi.fn();
      void pending.then(settled, settled);

      await vi.advanceTimersByTimeAsync(399);
      expect(settled).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({ min: 89.9, max: 149.9, basedOn: 6 });
      expect(settled).toHaveBeenCalledTimes(1);
    });

    it('mockPriceNoBase=1 resolve com limites nulos, contagem zero e justificativa', async () => {
      window.history.pushState({}, '', '/?mockPriceNoBase=1');

      const suggestion = await resolveMock();

      expect(suggestion).toEqual({
        min: null,
        max: null,
        justification: expect.stringMatching(/comparáveis|base|semelhantes/i),
        basedOn: 0,
      });
    });

    it('não realiza requisições HTTP nem grava a sugestão em storage', async () => {
      const storageWrite = vi.spyOn(Storage.prototype, 'setItem');

      await resolveMock();

      expect(adapter).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(storageWrite).not.toHaveBeenCalled();
    });
  });

  describe('flag VITE_USE_MOCKS', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it.each([undefined, 'true', '0', 'FALSE'])(
      'usa mock quando VITE_USE_MOCKS=%s',
      async (flag) => {
        vi.stubEnv('VITE_USE_MOCKS', flag);

        await resolveMock();

        expect(adapter).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
      },
    );

    it('usa API real somente para o valor literal false, mesmo com o gatilho mock na URL', async () => {
      vi.stubEnv('VITE_USE_MOCKS', 'false');
      window.history.pushState({}, '', '/?mockPriceNoBase=1');

      await expect(priceService.suggestPrice(PRICE_INPUT)).resolves.toEqual(PRICE_SUGGESTION);

      expect(adapter).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
