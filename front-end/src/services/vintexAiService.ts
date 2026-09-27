import { getAuthToken, handleAuthRequired } from '@/services/httpClient';
import { mapFeedItem, type ApiFeedItem } from '@/services/catalogService';
import { products as mockProducts } from '@/mocks/products';
import type { ChatChunk, ChatMessage, ChatRequest, ChatRole } from '@/types/vintex-ai';

/**
 * Camada de acesso à IA da Vintex.
 *
 * `chat()` é o método central desta evolução (#199): consome a conversa em
 * streaming e entrega `ChatChunk`s (`text` | `products` | `interpreted` |
 * `done` | `error`), no mock e na API real, com o mesmo contrato — quem
 * consome nunca sabe qual dos dois está por trás.
 *
 * `getOutfitSuggestion()` (do #138) foi **mantido como atalho independente**,
 * não reconstruído em cima de `chat()` decisão explícita, documentada
 * abaixo na própria função, porque `ChatChunk` não tem um tipo de chunk para
 * `outfit`.
 *
 * Troca mock↔API real: variável de ambiente `VITE_USE_MOCKS`. Ausente ou
 * `"true"` → mock (comportamento hoje, sempre, já que não existe backend de
 * IA ainda). Só `"false"` liga a chamada real.
 */

function isUsingMocks(): boolean {
  return import.meta.env.VITE_USE_MOCKS !== 'false';
}

/** Falha que não veio do back (rede, DNS, CORS, conexão cortada no meio). */
const FALHA_DE_CONEXAO = 'Não foi possível falar com a Vintex agora.';

// ---------------------------------------------------------------------------
// chat() streaming
// ---------------------------------------------------------------------------

/**
 * Consome a conversa em streaming. Cancelável via `request.signal`: abortar
 * encerra o gerador (sem emitir mais chunks) em vez de lançar um erro não
 * tratado quem consome só precisa parar de iterar, sem `try/catch`.
 */
export async function* chat(request: ChatRequest): AsyncGenerator<ChatChunk> {
  if (isUsingMocks()) {
    yield* mockChat(request);
  } else {
    yield* realChat(request);
  }
}

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

const MOCK_RESPONSE_TEXT =
  'Entendi: confortável, com memória de brechó e uma base fácil de usar. Separei algumas peças que combinam.';

const MOCK_WORD_DELAY_MS = 30;
const MOCK_STEP_DELAY_MS = 60;

/**
 * Liga o modo de falha do mock, pra telas cobrirem o caminho de erro/retry
 * sem depender de um backend de verdade. Query string (`?mockFail=1`) para
 * teste manual no navegador; `window.history.pushState` funciona igual em
 * teste automatizado (jsdom lê `window.location.search` normalmente).
 */
function shouldMockFail(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mockFail') === '1';
}

/** `setTimeout` que resolve na hora se `signal` já abortou, ou ao ser abortado. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function* mockChat(request: ChatRequest): AsyncGenerator<ChatChunk> {
  const { signal } = request;
  const words = MOCK_RESPONSE_TEXT.split(' ');
  const failAtWordIndex = shouldMockFail() ? Math.floor(words.length / 2) : -1;

  for (const [index, word] of words.entries()) {
    if (signal?.aborted) return;
    await sleep(MOCK_WORD_DELAY_MS, signal);
    if (signal?.aborted) return;

    if (index === failAtWordIndex) {
      yield { type: 'error', message: 'A Vintex não conseguiu responder agora. Tente de novo.' };
      return;
    }

    yield { type: 'text', delta: index === 0 ? word : ` ${word}` };
  }

  if (signal?.aborted) return;
  await sleep(MOCK_STEP_DELAY_MS, signal);
  if (signal?.aborted) return;

  yield { type: 'products', products: mockProducts.slice(0, 3) };

  if (signal?.aborted) return;
  await sleep(MOCK_WORD_DELAY_MS, signal);
  if (signal?.aborted) return;

  yield {
    type: 'interpreted',
    interpreted: {
      filters: { category: 'Roupas' },
      similarity: 'básico confortável',
    },
  };

  if (signal?.aborted) return;
  yield { type: 'done' };
}

// ---------------------------------------------------------------------------
// API real. Contrato conferido contra o back em 27/09 (`POST /api/ai/chat`,
// back-end#149), e ele diverge do tipo do front em três pontos — os três
// convertidos aqui, porque é esta camada que fala com a rede:
//
//   1. `role`: o back aceita `"user" | "assistant"` (`ChatTurn`). Mandar
//      `"vintex"` faz o FastAPI recusar o corpo inteiro com 422, o que
//      derrubava a conversa a partir da segunda pergunta.
//   2. `products`: chega no shape do feed (`cover_image_url`, `id` inteiro),
//      igual ao `GET /products`. Por isso reusa o `mapFeedItem` do
//      `catalogService` em vez de um segundo mapeamento paralelo.
//   3. `interpreted`: o back manda `filters`/`similarity` soltos no evento;
//      aqui eles voltam para dentro de `interpreted`, como o tipo do front
//      declara. Os *nomes* das chaves de `filters` continuam os do back
//      (`price_max`): converter isso é de quem for renderizar os chips
//      (#210), e o back ainda não emite esse chunk.
// ---------------------------------------------------------------------------

/** O back não conhece o papel `vintex`; no protocolo dele a resposta é `assistant`. */
function toWireRole(role: ChatRole): 'user' | 'assistant' {
  return role === 'vintex' ? 'assistant' : 'user';
}

async function* realChat(request: ChatRequest): AsyncGenerator<ChatChunk> {
  const token = getAuthToken();
  const currentRoute =
    typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';

  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Return-To': currentRoute,
      },
      body: JSON.stringify({
        messages: request.messages.map(({ role, text }) => ({ role: toWireRole(role), text })),
      }),
      signal: request.signal,
    });
  } catch {
    // `fetch` rejeita com back fora do ar, DNS, CORS — e também no abort.
    // O contrato de `chat()` promete que abortar encerra o gerador em vez de
    // lançar, e que quem consome não precisa de `try/catch`. Sem isto a
    // promessa era falsa: a rejeição subia para quem itera e a bolha ficava
    // vazia para sempre, sem texto de erro e sem botão de tentar de novo.
    if (request.signal?.aborted) return;
    yield { type: 'error', message: FALHA_DE_CONEXAO };
    return;
  }

  if (response.status === 401) {
    handleAuthRequired(currentRoute);
    return;
  }

  if (!response.ok || !response.body) {
    yield { type: 'error', message: `Falha ao conectar com a Vintex (HTTP ${response.status}).` };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    let value: Uint8Array | undefined;
    let done: boolean;
    try {
      ({ value, done } = await reader.read());
    } catch {
      // Conexão cortada no meio do stream: mesma regra do `fetch` acima.
      if (request.signal?.aborted) return;
      yield { type: 'error', message: FALHA_DE_CONEXAO };
      return;
    }
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const chunk = parseSseEvent(rawEvent);
      if (chunk) yield chunk;

      separatorIndex = buffer.indexOf('\n\n');
    }
  }
}

function parseSseEvent(raw: string): ChatChunk | null {
  const dataLine = raw.split('\n').find((line) => line.startsWith('data:'));
  if (!dataLine) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(dataLine.slice('data:'.length).trim());
  } catch {
    return { type: 'error', message: 'Resposta da Vintex em formato inesperado.' };
  }

  return toChatChunk(payload);
}

/**
 * Evento do back -> `ChatChunk` do front. Não é cast: `products` e
 * `interpreted` têm shape diferente dos dois lados (ver o bloco de contrato
 * acima), e o `as ChatChunk` que estava aqui só escondia isso do compilador.
 * Evento de tipo desconhecido é ignorado, para um chunk novo no back não
 * quebrar a tela.
 */
function toChatChunk(payload: unknown): ChatChunk | null {
  if (typeof payload !== 'object' || payload === null) return null;

  switch ((payload as { type?: unknown }).type) {
    case 'text': {
      const { delta } = payload as { delta?: unknown };
      return typeof delta === 'string' ? { type: 'text', delta } : null;
    }
    case 'products': {
      const { products } = payload as { products?: ApiFeedItem[] };
      return { type: 'products', products: (products ?? []).map(mapFeedItem) };
    }
    case 'interpreted': {
      const { filters, similarity } = payload as {
        filters?: Record<string, string>;
        similarity?: string | null;
      };
      return {
        type: 'interpreted',
        interpreted: { filters: filters ?? {}, similarity: similarity ?? undefined },
      };
    }
    case 'done':
      return { type: 'done' };
    case 'error': {
      const { message } = payload as { message?: unknown };
      return {
        type: 'error',
        message: typeof message === 'string' ? message : FALHA_DE_CONEXAO,
      };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// getOutfitSuggestion: atalho independente (ver doc comment acima do arquivo)
// ---------------------------------------------------------------------------

/**
 * Sugestão de look pronta (título + peças com ícone + nota), no formato que
 * `OutfitSuggestionCard` (#139) espera. Mantido como mock direto, **não**
 * construído em cima de `chat()`: `ChatChunk` não tem um chunk `outfit`, e
 * forçar essa forma dentro da união do streaming não encaixaria no
 * contrato. Usado hoje por `VintexAI.tsx`; migra para `chat()` quando essa
 * tela adotar streaming de verdade (#208).
 */
export async function getOutfitSuggestion(prompt: string): Promise<ChatMessage> {
  // O mock ignora o conteúdo do prompt por enquanto; a IA real vai usá-lo
  // para gerar a sugestão.
  void prompt;

  return {
    id: crypto.randomUUID(),
    role: 'vintex',
    createdAt: new Date().toISOString(),
    text: 'Entendi: confortável, com memória de brechó e uma base fácil de usar. Montei uma primeira combinação com contraste baixo e uma textura para dar personalidade.',
    outfit: {
      title: 'Domingo de garimpo',
      description: 'Uma composição leve para circular pela cidade e ainda render um achado.',
      items: [
        { id: 'i1', label: 'Camisa leve', icon: 'shirt' },
        { id: 'i2', label: 'Jeans reto', icon: 'pants' },
        { id: 'i3', label: 'Bolsa de couro', icon: 'bag' },
      ],
      note: 'Conteúdo sintético para visualizar a ideia. A curadoria real poderá cruzar suas preferências com peças disponíveis.',
    },
  };
}
