import { useEffect, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { chat } from '@/services/vintexAiService';
import type { ChatMessage } from '@/types/vintex-ai';

interface VintexChatState {
  messages: ChatMessage[];
  /** Id da mensagem da Vintex sendo escrita agora, ou `null` se nenhuma. */
  streamingMessageId: string | null;
  /** Id da mensagem que falhou, ou `null` se nenhuma. */
  errorMessageId: string | null;
  errorText: string | null;
}

interface UseVintexChatResult extends VintexChatState {
  sendMessage: (text: string) => void;
  /** Reenvia a última pergunta, reaproveitando a bolha que falhou. */
  retry: () => void;
}

function createMessage(role: ChatMessage['role'], text: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    createdAt: new Date().toISOString(),
    text,
  };
}

// ---------------------------------------------------------------------------
// Store a nível de módulo — de propósito, fora do ciclo de vida de qualquer
// componente. Sair de /vintex pra ver o detalhe de uma peça desmonta a
// página (#209): se o estado vivesse em `useState`, a conversa e o
// streaming em andamento se perderiam nesse momento. Aqui eles sobrevivem —
// só um reload de página de verdade reinicia a conversa (ou uma chamada
// explícita a `resetVintexChat`).
// ---------------------------------------------------------------------------

let state: VintexChatState = {
  messages: [],
  streamingMessageId: null,
  errorMessageId: null,
  errorText: null,
};
let hasBootstrapped = false;
let lastUserText: string | null = null;
let abortController: AbortController | null = null;
const listeners = new Set<() => void>();

function setState(
  patch: Partial<VintexChatState> | ((current: VintexChatState) => Partial<VintexChatState>),
): void {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  // `flushSync`: cada chunk chega via `setTimeout`/`fetch` — fora do ciclo
  // de eventos que o React controla. Sem forçar aqui, a atualização pode
  // ficar pendurada esperando um próximo render normal do React acontecer.
  // Nunca é chamado de dentro de um efeito (`flushSync` não roda durante o
  // commit do React) — ver o disparo adiado da mensagem inicial abaixo.
  flushSync(() => {
    listeners.forEach((listener) => listener());
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): VintexChatState {
  return state;
}

function runStream(history: ChatMessage[], vintexMessageId: string): void {
  abortController?.abort();
  const controller = new AbortController();
  abortController = controller;

  setState({ streamingMessageId: vintexMessageId });

  (async () => {
    try {
      for await (const chunk of chat({
        messages: history.map(({ role, text }) => ({ role, text })),
        signal: controller.signal,
      })) {
        if (chunk.type === 'text') {
          setState((current) => ({
            messages: current.messages.map((message) =>
              message.id === vintexMessageId
                ? { ...message, text: message.text + chunk.delta }
                : message,
            ),
          }));
        } else if (chunk.type === 'products') {
          setState((current) => ({
            messages: current.messages.map((message) =>
              message.id === vintexMessageId ? { ...message, products: chunk.products } : message,
            ),
          }));
        } else if (chunk.type === 'interpreted') {
          setState((current) => ({
            messages: current.messages.map((message) =>
              message.id === vintexMessageId
                ? { ...message, interpreted: chunk.interpreted }
                : message,
            ),
          }));
        } else if (chunk.type === 'error') {
          setState({ errorMessageId: vintexMessageId, errorText: chunk.message });
        }
      }
    } finally {
      setState((current) => ({
        streamingMessageId:
          current.streamingMessageId === vintexMessageId ? null : current.streamingMessageId,
      }));
    }
  })();
}

function sendMessage(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  lastUserText = trimmed;
  const userMessage = createMessage('user', trimmed);
  const vintexMessage = createMessage('vintex', '');
  const history = [...state.messages, userMessage];

  setState((current) => ({ messages: [...current.messages, userMessage, vintexMessage] }));
  runStream(history, vintexMessage.id);
}

function retry(): void {
  const failedId = state.errorMessageId;
  if (!lastUserText || !failedId) return;

  const history = state.messages.filter((message) => message.id !== failedId);

  setState((current) => ({
    messages: current.messages.map((message) =>
      message.id === failedId ? { ...message, text: '' } : message,
    ),
    errorMessageId: null,
    errorText: null,
  }));

  runStream(history, failedId);
}

/**
 * Limpa o store (nova conversa). Abort no stream em andamento, se houver.
 * Existe principalmente para isolar testes entre si, já que o store é
 * módulo-escopado — mas serve igual pra uma futura ação de "nova conversa".
 */
export function resetVintexChat(): void {
  abortController?.abort();
  abortController = null;
  hasBootstrapped = false;
  lastUserText = null;
  state = { messages: [], streamingMessageId: null, errorMessageId: null, errorText: null };
  listeners.forEach((listener) => listener());
}

/**
 * Estado da conversa com a Vintex e o consumo do `AsyncIterable` devolvido
 * por `vintexAiService.chat()` (#199) — guardados num store módulo-escopado
 * (ver acima), não em `useState`: a conversa e o streaming em andamento
 * sobrevivem a sair de `/vintex` (ex.: abrir o detalhe de uma peça) e
 * voltar (#209). A página só compõe: chama `sendMessage`/`retry` e passa
 * `streamingMessageId`/`errorMessageId` para o `ChatBubble` (#197) —
 * nenhuma regra de negócio no componente de apresentação.
 *
 * Enviar uma mensagem nova aborta qualquer stream anterior ainda em
 * andamento (o usuário pode interromper e perguntar outra coisa); o
 * histórico enviado ao service inclui toda a conversa até ali.
 *
 * Usage:
 *   const { messages, streamingMessageId, errorMessageId, errorText, sendMessage, retry } =
 *     useVintexChat(location.state?.message);
 *
 *   <ChatBubble
 *     message={message}
 *     streaming={message.id === streamingMessageId}
 *     error={message.id === errorMessageId ? errorText ?? undefined : undefined}
 *     onRetry={retry}
 *   />
 */
export function useVintexChat(initialMessage?: string): UseVintexChatResult {
  const trimmedInitial = initialMessage?.trim();

  /**
   * A bolha do usuário (vinda da navegação, #207) aparece já na primeira
   * renderização — mutação direta, sem passar por `setState`/`flushSync`
   * (que não pode ser chamado durante o render). O streaming de verdade
   * (que depende de rede) só pode começar depois, então fica no efeito
   * abaixo.
   */
  let bootstrapUserMessage: ChatMessage | null = null;
  if (trimmedInitial && !hasBootstrapped) {
    hasBootstrapped = true;
    bootstrapUserMessage = createMessage('user', trimmedInitial);
    state = { ...state, messages: [...state.messages, bootstrapUserMessage] };
  }

  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (!bootstrapUserMessage) return;
    const userMessage = bootstrapUserMessage;

    // Adiado numa microtask: chamado de dentro de um efeito, e
    // `runStream`/`setState` usa `flushSync`, que não pode rodar enquanto
    // o React ainda está no meio do commit deste mesmo ciclo.
    queueMicrotask(() => {
      const vintexMessage = createMessage('vintex', '');
      setState((current) => ({ messages: [...current.messages, vintexMessage] }));
      runStream([userMessage], vintexMessage.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...snapshot, sendMessage, retry };
}
