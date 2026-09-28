import { getAuthToken, handleAuthRequired } from '@/services/httpClient';
import { mapFeedItem, type ApiFeedItem } from '@/services/catalogService';
import { products as mockProducts } from '@/mocks/products';
import type {
  ChatChunk,
  ChatMessage,
  ChatRequest,
  ChatRole,
  ListingSuggestion,
  ListingSuggestionField,
  ListingSuggestionResult,
} from '@/types/vintex-ai';

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
// suggestListing: preenchimento do anúncio a partir das fotos (RN-55..RN-58)
// ---------------------------------------------------------------------------

/**
 * Limite do back (`ListingSuggestionsRequest.image_urls`, `max_length=8`), que
 * ele ganhou justamente porque cada URL é baixada e mandada para a API de IA.
 * Recusar aqui evita uma ida ao servidor para receber 422.
 */
const MAX_FOTOS = 8;

/** Ordem fixa: é a que a tela usa para listar o que a IA preencheu. */
const CAMPOS_SUGERIVEIS: ListingSuggestionField[] = [
  'category',
  'color',
  'size',
  'condition',
  'description',
  'brand',
];

const SEM_MARCA = 'Marca não identificada: etiqueta ilegível ou ausente.';
const NADA_IDENTIFICADO =
  'Não identificamos nada nas fotos. Preencha os campos à mão ou tente outra foto.';

// 503 `AI_UNAVAILABLE` (back-end#150): o provedor está fora do ar, e não a
// foto que está ruim. A distinção existe porque o back passou a separar as
// duas — antes as duas chegavam como 200 com todos os campos nulos, e o
// vendedor lia que a foto dele era ilegível enquanto o Gemini estava
// sobrecarregado.
const IA_FORA_DO_AR =
  'A Vintex está indisponível no momento. Tente de novo em instantes ou preencha os campos à mão.';

const IA_INDISPONIVEL = 'Não foi possível analisar as fotos agora. Preencha os campos à mão.';
const ANALISE_DEMOROU = 'A análise das fotos demorou demais. Preencha os campos à mão.';
const ANALISE_INTERROMPIDA = 'Análise das fotos interrompida.';
const FOTO_RECUSADA = 'Alguma das fotos não foi aceita para análise.';

const TIMEOUT_PADRAO_MS = 30_000;
const INTERVALO_POLLING_MS = 1_500;

/** Campo do `ImageAnalysisResult` do back: valor mais uma confiança opcional. */
interface ApiSuggestedField {
  value: string;
  confidence?: number | null;
}

type ApiImageAnalysisResult = Partial<Record<ListingSuggestionField, ApiSuggestedField | null>>;

interface ApiProductAIStatus {
  status: 'not_requested' | 'pending' | 'processing' | 'done' | 'failed';
  error?: string | null;
  suggestions?: ApiImageAnalysisResult | null;
}

/**
 * `ImageAnalysisResult` → `ListingSuggestion`. Campo ausente ou `null` não
 * entra em `suggested`, que é o que a tela usa para marcar o que veio da IA:
 * marcar um campo vazio como sugerido seria pior que não marcar.
 */
function montarSugestao(api: ApiImageAnalysisResult): ListingSuggestion {
  const fields: ListingSuggestion['fields'] = {};
  const suggested: ListingSuggestionField[] = [];
  const confidence: NonNullable<ListingSuggestion['confidence']> = {};

  for (const campo of CAMPOS_SUGERIVEIS) {
    const sugerido = api[campo];
    if (!sugerido || !sugerido.value) continue;

    fields[campo] = sugerido.value;
    suggested.push(campo);
    if (typeof sugerido.confidence === 'number') confidence[campo] = sugerido.confidence;
  }

  const notes: string[] = [];
  if (suggested.length === 0) notes.push(NADA_IDENTIFICADO);
  else if (!suggested.includes('brand')) notes.push(SEM_MARCA);

  return {
    fields,
    suggested,
    ...(Object.keys(confidence).length > 0 ? { confidence } : {}),
    ...(notes.length > 0 ? { notes } : {}),
  };
}

export interface SuggestListingInput {
  imageUrls: string[];
  /**
   * Quando informado, o service espera o pipeline assíncrono da peça em vez de
   * chamar a rota síncrona (ver o comentário do `realSuggestListing`).
   */
  productId?: string;
}

export interface SuggestListingOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Campos sugeridos para o anúncio a partir das fotos (RN-55), com a lista do
 * que veio da IA para a tela marcar (RN-56). **Nunca lança** (RN-57): rede
 * fora, IA indisponível, demora e foto recusada saem como
 * `{ ok: false, reason }`.
 *
 * Usage:
 *   const r = await suggestListing({ imageUrls });
 *   if (r.ok) preencher(r.suggestion.fields, r.suggestion.suggested);
 *   else avisar(r.message);
 */
export async function suggestListing(
  input: SuggestListingInput,
  opts: SuggestListingOptions = {},
): Promise<ListingSuggestionResult> {
  if (input.imageUrls.length === 0) {
    return { ok: false, reason: 'invalid-image', message: 'Envie ao menos uma foto.' };
  }

  if (input.imageUrls.length > MAX_FOTOS) {
    return {
      ok: false,
      reason: 'invalid-image',
      message: `A análise aceita no máximo ${MAX_FOTOS} fotos por peça.`,
    };
  }

  return isUsingMocks() ? mockSuggestListing(input, opts) : realSuggestListing(input, opts);
}

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

const MOCK_RESPONSE_TEXT =
  'Entendi: confortável, com memória de brechó e uma base fácil de usar. Separei algumas peças que combinam.';

const MOCK_WORD_DELAY_MS = 30;
const MOCK_ANALISE_DELAY_MS = 800;
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

/**
 * `VITE_API_BASE_URL` **já termina em `/api`** (ver `.env.example`), porque é
 * ela que o `httpClient` usa como `baseURL`. Então caminho daqui começa depois
 * do `/api`, igual ao que os outros services passam para o axios. Concatenar
 * um caminho que comece com `/api` gera `/api/api/...`, que responde 404 — e o
 * teste não pega se comparar com `toContain`, porque a URL dobrada contém a
 * certa.
 */

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
    response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/ai/chat`, {
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

/**
 * Sugestão de anúncio sem backend, para as telas do cadastro rodarem antes de
 * o flag virar. `brand` só aparece quando o nome de algum arquivo tem
 * `etiqueta`, simulando o RN-58: a IA não chuta marca, ela lê a etiqueta.
 */
async function mockSuggestListing(
  input: SuggestListingInput,
  opts: SuggestListingOptions,
): Promise<ListingSuggestionResult> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_PADRAO_MS;

  // Timeout mais curto que a análise: é como a tela cobre o RN-57 sem backend.
  if (timeoutMs < MOCK_ANALISE_DELAY_MS) {
    await sleep(timeoutMs, opts.signal);
    return { ok: false, reason: 'timeout', message: ANALISE_DEMOROU };
  }

  await sleep(MOCK_ANALISE_DELAY_MS, opts.signal);
  if (opts.signal?.aborted) {
    return { ok: false, reason: 'unavailable', message: ANALISE_INTERROMPIDA };
  }

  if (shouldMockFail()) {
    return { ok: false, reason: 'unavailable', message: IA_INDISPONIVEL };
  }

  const temEtiqueta = input.imageUrls.some((url) => url.toLowerCase().includes('etiqueta'));

  return {
    ok: true,
    suggestion: montarSugestao({
      category: { value: 'Jaquetas', confidence: 0.94 },
      color: { value: 'Preto', confidence: 0.91 },
      size: { value: 'M', confidence: 0.72 },
      condition: { value: 'Seminovo', confidence: 0.68 },
      description: {
        value: 'Jaqueta de couro sintético preta, forro interno e zíper prateado.',
        confidence: 0.8,
      },
      brand: temEtiqueta ? { value: 'Zara', confidence: 0.77 } : null,
    }),
  };
}

/**
 * Dois caminhos no back, e a tela não sabe qual está em uso:
 *
 * - **sem `productId`**: `POST /api/ai/listing-suggestions` com as URLs, que
 *   responde na hora. É o caminho do cadastro, porque as fotos existem antes
 *   da peça.
 * - **com `productId`**: o pipeline assíncrono já ligado à peça
 *   (`GET /api/users/me/products/{id}/ai-status`), consultado até `done` ou
 *   `failed` dentro do orçamento de tempo.
 *
 * A rota síncrona **esconde a própria falha**: quando a IA não responde, ela
 * devolve 200 com todos os campos nulos, igual a uma foto ilegível
 * (`AssistantController.suggest_listing`). Então `reason: 'unavailable'` só sai
 * de erro de transporte, e IA fora do ar chega aqui como sucesso sem nenhum
 * campo. O caminho assíncrono distingue, porque tem `status: 'failed'`.
 */
async function realSuggestListing(
  input: SuggestListingInput,
  opts: SuggestListingOptions,
): Promise<ListingSuggestionResult> {
  const prazo = Date.now() + (opts.timeoutMs ?? TIMEOUT_PADRAO_MS);

  if (input.productId) {
    return aguardarPipeline(input.productId, prazo, opts.signal);
  }

  const resposta = await pedir<ApiImageAnalysisResult>(
    '/ai/listing-suggestions',
    { image_urls: input.imageUrls },
    prazo,
    opts.signal,
  );

  if (!resposta.ok) return resposta.erro;
  return { ok: true, suggestion: montarSugestao(resposta.dados) };
}

/**
 * Consulta o status da análise até sair de `pending`/`processing`. `prazo` é
 * absoluto de propósito: o orçamento de tempo é da operação inteira, não de
 * cada consulta, senão uma análise lenta ficaria em loop para sempre.
 */
async function aguardarPipeline(
  productId: string,
  prazo: number,
  signal?: AbortSignal,
): Promise<ListingSuggestionResult> {
  while (Date.now() < prazo) {
    const resposta = await pedir<ApiProductAIStatus>(
      `/users/me/products/${encodeURIComponent(productId)}/ai-status`,
      undefined,
      prazo,
      signal,
    );

    if (!resposta.ok) return resposta.erro;

    const { status, error, suggestions } = resposta.dados;

    if (status === 'done') {
      return { ok: true, suggestion: montarSugestao(suggestions ?? {}) };
    }

    if (status === 'failed') {
      return { ok: false, reason: 'unavailable', message: error ?? IA_INDISPONIVEL };
    }

    if (status === 'not_requested') {
      return {
        ok: false,
        reason: 'unavailable',
        message: 'Esta peça não tem fotos enviadas para análise.',
      };
    }

    // Limitado pelo prazo: dormir o intervalo inteiro faria a operação passar
    // do orçamento que o chamador pediu, em até um intervalo.
    await sleep(Math.min(INTERVALO_POLLING_MS, prazo - Date.now()), signal);
    if (signal?.aborted) {
      return { ok: false, reason: 'unavailable', message: ANALISE_INTERROMPIDA };
    }
  }

  return { ok: false, reason: 'timeout', message: ANALISE_DEMOROU };
}

type Pedido<T> = { ok: true; dados: T } | { ok: false; erro: ListingSuggestionResult };

/**
 * `fetch` com o prazo da operação e o 401 tratado como no resto do service.
 * Devolve o erro já no formato de resultado, para os dois caminhos acima não
 * repetirem a tradução.
 */
async function pedir<T>(
  caminho: string,
  corpo: unknown,
  prazo: number,
  signal?: AbortSignal,
): Promise<Pedido<T>> {
  const restante = prazo - Date.now();
  if (restante <= 0) {
    return { ok: false, erro: { ok: false, reason: 'timeout', message: ANALISE_DEMOROU } };
  }

  const token = getAuthToken();
  const currentRoute =
    typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';

  const relogio = new AbortController();
  const timer = setTimeout(() => relogio.abort(), restante);
  const cancelarPeloChamador = () => relogio.abort();
  signal?.addEventListener('abort', cancelarPeloChamador);

  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${caminho}`, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers: {
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-Return-To': currentRoute,
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      signal: relogio.signal,
    });

    if (response.status === 401) {
      handleAuthRequired(currentRoute);
      return {
        ok: false,
        erro: { ok: false, reason: 'unavailable', message: 'Entre na sua conta para continuar.' },
      };
    }

    // 422 é o corpo recusado pelo back (mais fotos que o limite, URL inválida).
    if (response.status === 422) {
      return { ok: false, erro: { ok: false, reason: 'invalid-image', message: FOTO_RECUSADA } };
    }

    if (response.status === 503) {
      return { ok: false, erro: { ok: false, reason: 'unavailable', message: IA_FORA_DO_AR } };
    }

    if (!response.ok) {
      return { ok: false, erro: { ok: false, reason: 'unavailable', message: IA_INDISPONIVEL } };
    }

    return { ok: true, dados: (await response.json()) as T };
  } catch {
    // Só o relógio aborta sozinho; quando o chamador aborta, o `signal` dele
    // também está abortado, e aí não é demora, é cancelamento.
    if (signal?.aborted) {
      return {
        ok: false,
        erro: { ok: false, reason: 'unavailable', message: ANALISE_INTERROMPIDA },
      };
    }
    if (relogio.signal.aborted) {
      return { ok: false, erro: { ok: false, reason: 'timeout', message: ANALISE_DEMOROU } };
    }
    return { ok: false, erro: { ok: false, reason: 'unavailable', message: IA_INDISPONIVEL } };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancelarPeloChamador);
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
