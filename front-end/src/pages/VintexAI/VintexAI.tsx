import { useEffect, useRef, useState, type SVGProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChatBubble } from '@/components/vintex-ai/ChatBubble';
import { SearchBar } from '@/components/catalog/SearchBar';
import { FilterChip } from '@/components/catalog/FilterChip';
import IconButton from '@/components/common/IconButton';
import { getOutfitSuggestion } from '@/services/vintexAiService';
import { paths } from '@/routes/paths';
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
      {/*
        Um degrau só: era `text-body` (16px) no celular e `text-h2` (48px) a
        partir de `web`, um salto de 3x entre dois tamanhos fixos, com
        `whitespace-nowrap` segurando a linha. Com o `h2` fluido a mesma classe
        cobre a faixa inteira e a frase pode quebrar quando precisar.
      */}
      <p className="font-display text-h2 text-tinta">Vamos garimpar com intenção?</p>
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
    createdAt: 'agora',
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
 * inline aqui. Tipos vêm de `@/types/vintex-ai` (#138, evoluído em #199:
 * `createdAt` no lugar do antigo `timestamp`).
 *
 * Responsiva (breakpoints `tablet:`/`web:` de `src/styles/tokens.ts`): a
 * partir do `web:`, o cabeçalho e a linha acima das mensagens ocupam a
 * largura toda da tela, enquanto as mensagens e o composer ficam num
 * bloco central mais largo.
 *
 * Fora de escopo: qualquer IA real/streaming — a página ainda consome
 * `getOutfitSuggestion` (mock), migra para `chat()` (streaming, #199) em #208.
 *
 * Usage:
 *   import VintexAI from '@/pages/VintexAI/VintexAI';
 *   <VintexAI />
 */
export default function VintexAI() {
  const location = useLocation();
  const navigate = useNavigate();
  const incomingMessage = (location.state as { message?: string } | null)?.message;

  /**
   * Agora que `/vintex` tem rota (#178), dá para chegar aqui por URL direta ou
   * por refresh. Nesse caso `location.key` é `'default'`: não há entrada
   * anterior no histórico do app, e um `history.back()` sairia do site. Volta
   * para a home quando não há de onde vir.
   */
  const handleBack = () => {
    if (location.key === 'default') navigate(paths.home);
    else navigate(-1);
  };

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
          createdAt: 'agora',
          text: 'Não consegui responder agora. Tenta de novo em instantes?',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  const hasMessages = messages.length > 0;

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
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-papel font-ui text-tinta">
      <header className="flex items-center gap-4 border-b border-linha px-4 py-4 tablet:px-8 web:px-10">
        <IconButton
          icon={<BackIcon className="h-5 w-5" />}
          ariaLabel="Voltar"
          onClick={handleBack}
        />
        <h1 className="font-display text-body font-semibold text-tinta">Conversa com a Vintex</h1>
      </header>

      {/*
        Sem mensagem nenhuma, a abertura se centra no espaço livre: ela ficava
        colada no topo com uns 700px de vazio até o campo, e a régua abaixo dela
        anunciava uma seção que não existia ainda. Com a conversa em andamento o
        bloco volta a rolar normalmente a partir do topo.
      */}
      <div
        className={`vintex-chat-scroll flex flex-1 flex-col overflow-y-auto px-4 pb-6 pt-6 tablet:px-8 web:px-10 ${
          hasMessages ? '' : 'justify-center'
        }`}
      >
        <div className="mx-auto w-full max-w-3xl">
          <IntroPrompt />
        </div>

        {hasMessages ? <hr className="mx-auto mt-6 w-full max-w-3xl border-linha" /> : null}

        <div className="mx-auto w-full max-w-3xl space-y-4 pt-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="w-full tablet:max-w-[75%]">
                <ChatBubble message={message} />
              </div>
            </div>
          ))}
          <div ref={endOfMessagesRef} />
        </div>
      </div>

      <div className="border-t border-linha bg-papel px-4 pb-4 pt-3 tablet:px-8 web:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {SUGGESTION_CHIPS.map((chip) => (
              <FilterChip key={chip} label={chip} onToggle={() => handleChipClick(chip)} />
            ))}
          </div>

          <SearchBar
            value={draft}
            onChange={setDraft}
            onSubmit={handleSearchSubmit}
            placeholder="O que você quer vestir?"
            submitLabel="Enviar"
            loading={isSending}
          />
        </div>
      </div>
    </div>
  );
}
