import { useEffect, useRef, useState, type SVGProps } from 'react';
import { useLocation } from 'react-router-dom';
import { ChatBubble } from '@/components/vintex-ai/ChatBubble';
import { SearchBar } from '@/components/catalog/SearchBar';
import { FilterChip } from '@/components/catalog/FilterChip';
import IconButton from '@/components/common/IconButton';
import { getOutfitSuggestion } from '@/services/vintexAiService';
import type { ChatMessage } from '@/types/vintex-ai';

const SUGGESTION_CHIPS = ['Look para um jantar', 'Cores mais neutras', 'Até R$ 250'];

function BackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Convite inicial da conversa. Fica inline (não é um componente
 * reutilizável em outro lugar do produto) — só existe nesta tela.
 */
function IntroPrompt() {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 pb-6">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-vermelho-escuro text-vermelho-escuro web:translate-y-1">
        <PlusIcon className="h-4 w-4" />
      </span>
      <p className="font-display text-body font-semibold text-tinta web:whitespace-nowrap web:text-h2">
        Vamos garimpar com intenção?
      </p>
      <p className="col-start-2 mt-1 text-body text-texto-auxiliar">
        Me conte a ocasião, as cores que você gosta ou uma peça que já mora no seu armário.
      </p>
    </div>
  );
}

function createUserMessage(text: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    timestamp: 'agora',
    text,
  };
}

/**
 * Tela de conversa com a assistente Vintex.
 *
 * Página fina: só compõe peças que já existem — `ChatBubble` (#142) para
 * as mensagens, `SearchBar` (#120) para o composer, `FilterChip` (#134)
 * para os chips de sugestão e `IconButton` (#113) para o botão de voltar.
 * A resposta da Vintex vem do `vintexAiService` (#138); não há mock
 * inline aqui. Tipos vêm de `@/types/vintex-ai` (#138).
 *
 * Responsiva (breakpoints `tablet:`/`web:` de `src/styles/tokens.ts`): a
 * partir do `web:`, o cabeçalho e a linha acima das mensagens ocupam a
 * largura toda da tela, enquanto as mensagens e o composer ficam num
 * bloco central mais largo.
 *
 * Fora de escopo: registrar a rota `/vintex` (fica para #106) e qualquer
 * IA real/streaming (backend de IA vive em repositório separado).
 *
 * Usage:
 *   import VintexAI from '@/pages/VintexAI/VintexAI';
 *   <VintexAI />
 */
export default function VintexAI() {
  const location = useLocation();
  const incomingMessage = (location.state as { message?: string } | null)?.message;

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    incomingMessage ? [createUserMessage(incomingMessage)] : [],
  );
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const hasSentIncomingMessage = useRef(false);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (incomingMessage && !hasSentIncomingMessage.current) {
      hasSentIncomingMessage.current = true;
      void sendToVintex(incomingMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendToVintex(prompt: string) {
    setIsSending(true);
    try {
      const reply = await getOutfitSuggestion(prompt);
      setMessages((current) => [...current, reply]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'vintex',
          timestamp: 'agora',
          text: 'Não consegui responder agora. Tenta de novo em instantes?',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleSearchSubmit(term: string) {
    const trimmed = term.trim();
    if (!trimmed || isSending) return;

    setMessages((current) => [...current, createUserMessage(trimmed)]);
    setDraft('');
    void sendToVintex(trimmed);
  }

  function handleChipClick(chip: string) {
    setDraft(chip);
  }

  return (
    <div className="mx-auto flex h-screen w-full max-w-md flex-col overflow-hidden bg-papel font-ui text-tinta tablet:max-w-2xl web:max-w-none">
      <header className="flex items-center gap-4 border-b border-linha px-4 py-4 tablet:px-8 web:px-10">
        <IconButton
          icon={<BackIcon className="h-5 w-5" />}
          ariaLabel="Voltar"
          onClick={() => window.history.back()}
        />
        <h1 className="font-display text-body font-semibold text-tinta">Conversa com a Vintex</h1>
      </header>

      <div className="vintex-chat-scroll flex-1 overflow-y-auto px-4 pb-6 pt-6 tablet:px-8 web:px-10">
        <div className="mx-auto w-full max-w-md tablet:max-w-2xl web:max-w-6xl">
          <div className="mx-auto w-full web:max-w-4xl">
            <IntroPrompt />
          </div>
        </div>

        <hr className="border-linha" />

        <div className="mx-auto w-full max-w-md space-y-4 pt-6 tablet:max-w-2xl web:max-w-6xl">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="w-full tablet:max-w-[70%] web:max-w-[65%]">
                <ChatBubble message={message} />
              </div>
            </div>
          ))}
          <div ref={endOfMessagesRef} />
        </div>
      </div>

      <div className="border-t border-linha bg-papel px-4 pb-4 pt-3 tablet:px-8 web:px-10">
        <div className="mx-auto w-full max-w-md tablet:max-w-2xl web:max-w-6xl">
          <div className="mb-3 flex gap-2 overflow-x-auto">
            {SUGGESTION_CHIPS.map((chip) => (
              <FilterChip key={chip} label={chip} onToggle={() => handleChipClick(chip)} />
            ))}
          </div>

          <SearchBar
            value={draft}
            onChange={setDraft}
            onSubmit={handleSearchSubmit}
            placeholder="Conte o que você quer vestir..."
            loading={isSending}
          />
        </div>
      </div>
    </div>
  );
}
