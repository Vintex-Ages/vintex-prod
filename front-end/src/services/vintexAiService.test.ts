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
