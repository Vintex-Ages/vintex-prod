import { useCallback, useEffect, useRef, useState } from 'react';
import { chat } from '@/services/vintexAiService';
import type { ChatMessage } from '@/types/vintex-ai';

interface UseVintexChatResult {
  messages: ChatMessage[];
  /** Id da mensagem da Vintex sendo escrita agora, ou `null` se nenhuma. */
  streamingMessageId: string | null;
  /** Id da mensagem que falhou, ou `null` se nenhuma. */
  errorMessageId: string | null;
  errorText: string | null;
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

/**
 * Estado da conversa com a Vintex e o loop de consumo do `AsyncIterable`
 * devolvido por `vintexAiService.chat()` (#199). A página só compõe:
 * chama `sendMessage`/`retry` e passa `streamingMessageId`/`errorMessageId`
 * para o `ChatBubble` (#197) nenhuma regra de negócio no componente de
 * apresentação.
 *
 * Enviar uma mensagem nova aborta qualquer stream anterior ainda em
 * andamento (o usuário pode interromper e perguntar outra coisa); o
 * histórico enviado ao service inclui toda a conversa até ali. Desmontar
 * o componente que usa o hook também aborta o stream em andamento.
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
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessage?.trim() ? [createMessage('user', initialMessage.trim())] : [],
  );
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [errorMessageId, setErrorMessageId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const lastUserTextRef = useRef<string | null>(initialMessage?.trim() || null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const runStream = useCallback((history: ChatMessage[], vintexMessageId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStreamingMessageId(vintexMessageId);

    (async () => {
      try {
        for await (const chunk of chat({
          messages: history.map(({ role, text }) => ({ role, text })),
          signal: controller.signal,
        })) {
          if (chunk.type === 'text') {
            setMessages((current) =>
              current.map((message) =>
                message.id === vintexMessageId
                  ? { ...message, text: message.text + chunk.delta }
                  : message,
              ),
            );
          } else if (chunk.type === 'products') {
            setMessages((current) =>
              current.map((message) =>
                message.id === vintexMessageId ? { ...message, products: chunk.products } : message,
              ),
            );
          } else if (chunk.type === 'interpreted') {
            setMessages((current) =>
              current.map((message) =>
                message.id === vintexMessageId
                  ? { ...message, interpreted: chunk.interpreted }
                  : message,
              ),
            );
          } else if (chunk.type === 'error') {
            setErrorMessageId(vintexMessageId);
            setErrorText(chunk.message);
          }
        }
      } finally {
        setStreamingMessageId((current) => (current === vintexMessageId ? null : current));
      }
    })();
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      lastUserTextRef.current = trimmed;
      const userMessage = createMessage('user', trimmed);
      const vintexMessage = createMessage('vintex', '');
      const history = [...messagesRef.current, userMessage];

      setMessages((current) => [...current, userMessage, vintexMessage]);
      runStream(history, vintexMessage.id);
    },
    [runStream],
  );

  useEffect(() => {
    if (initialMessage?.trim() && messagesRef.current.length === 1) {
      const [firstMessage] = messagesRef.current;
      const vintexMessage = createMessage('vintex', '');
      setMessages((current) => [...current, vintexMessage]);
      runStream([firstMessage], vintexMessage.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = useCallback(() => {
    const lastUserText = lastUserTextRef.current;
    const failedId = errorMessageId;
    if (!lastUserText || !failedId) return;

    const history = messagesRef.current.filter((message) => message.id !== failedId);

    setMessages((current) =>
      current.map((message) => (message.id === failedId ? { ...message, text: '' } : message)),
    );
    setErrorMessageId(null);
    setErrorText(null);

    runStream(history, failedId);
  }, [errorMessageId, runStream]);

  return { messages, streamingMessageId, errorMessageId, errorText, sendMessage, retry };
}
