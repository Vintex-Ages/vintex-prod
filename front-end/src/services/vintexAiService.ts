import { getAuthToken, handleAuthRequired } from '@/services/httpClient';
import { products as mockProducts } from '@/mocks/products';
import type { ChatChunk, ChatMessage, ChatRequest } from '@/types/vintex-ai';

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
// API real proposta do front, não confirmada com o back (ver nota no
// final do arquivo). Sem teste automatizado: não há endpoint pra testar
// contra ainda (o provider de IA do back está "unavailable" por padrão).
// ---------------------------------------------------------------------------

async function* realChat(request: ChatRequest): AsyncGenerator<ChatChunk> {
  const token = getAuthToken();
  const currentRoute =
    typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';

  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Return-To': currentRoute,
    },
    body: JSON.stringify({ messages: request.messages }),
    signal: request.signal,
  });

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
    const { value, done } = await reader.read();
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

  try {
    return JSON.parse(dataLine.slice('data:'.length).trim()) as ChatChunk;
  } catch {
    return { type: 'error', message: 'Resposta da Vintex em formato inesperado.' };
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
