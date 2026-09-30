import { useEffect, useRef, useState, type SVGProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChatBubble } from '@/components/vintex-ai/ChatBubble';
import { FilterChip } from '@/components/catalog/FilterChip';
import Button from '@/components/common/Button';
import IconButton from '@/components/common/IconButton';
import InterpretedQueryChips from '@/components/vintex-ai/InterpretedQueryChips';
import { resetVintexChat, useVintexChat } from '@/hooks/useVintexChat';
import { paths } from '@/routes/paths';
import { toCatalogSearch } from '@/utils/catalogQuery';

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

function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path
        d="M3 12a9 9 0 0 1 15.36-6.36L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.36 6.36L3 16M3 21v-5h5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} {...props}>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Tela de conversa com a assistente Vintex.
 *
 * Página fina: só compõe peças que já existem — `ChatBubble` (#142, com os
 * estados de streaming/erro/produtos do #197), `FilterChip` (#134) para os
 * chips de sugestão e `IconButton`
 * (#113) para o botão de voltar. Todo o estado da conversa e o consumo do
 * streaming (`vintexAiService.chat()`, #199) vivem em `useVintexChat`
 * (#208) — a página só chama `sendMessage`/`retry` e repassa
 * `streamingMessageId`/`errorMessageId` para o `ChatBubble`.
 *
 * Responsiva (breakpoints `tablet:`/`web:` de `src/styles/tokens.ts`): a
 * partir do `web:`, o cabeçalho e a linha acima das mensagens ocupam a
 * largura toda da tela, enquanto as mensagens e o composer ficam num
 * bloco central mais largo.
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

  // `location.key` é única por navegação: é ela que faz cada entrada pelo
  // campo da Home valer um envio, e não só a primeira da sessão.
  const { messages, streamingMessageId, errorMessageId, errorText, sendMessage, retry } =
    useVintexChat(incomingMessage, location.key);
  const [draft, setDraft] = useState('');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const hasMessages = messages.length > 0;

  function handleSearchSubmit(term: string) {
    sendMessage(term);
    setDraft('');
  }

  function handleChipClick(chip: string) {
    setDraft(chip);
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-papel font-ui text-tinta">
      <header className="flex items-center gap-3 border-b border-linha px-4 py-3 tablet:px-8 web:px-10">
        <IconButton
          icon={<BackIcon className="h-5 w-5" />}
          ariaLabel="Voltar"
          onClick={handleBack}
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-body font-semibold leading-tight text-tinta">
            Conversa com a Vintex
          </h1>
          <p className="mt-1 text-label font-semibold uppercase tracking-wide text-texto-auxiliar">
            Curadoria de brechós
          </p>
        </div>
        <IconButton
          icon={<RefreshIcon className="h-5 w-5" />}
          ariaLabel="Recomeçar conversa"
          onClick={() => {
            resetVintexChat();
            setDraft('');
          }}
        />
      </header>

      <div className="vintex-chat-scroll flex flex-1 flex-col overflow-y-auto px-4 pb-6 pt-5 tablet:px-8 web:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <div className="grid grid-cols-[auto_1fr] items-start gap-3 border-b border-linha pb-4">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-vermelho-escuro text-vermelho-escuro">
              <PlusIcon className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-h3 text-tinta">Sempre há um próximo garimpo</h2>
              <p className="mt-1 text-body-sm leading-relaxed text-texto-auxiliar">
                Quando a peça exata não existe, a Vintex aproxima a busca pelo que mais combina com
                seu pedido.
              </p>
            </div>
          </div>
        </div>

        {hasMessages ? <hr className="mx-auto mt-6 w-full max-w-3xl border-linha" /> : null}

        <div className="mx-auto w-full max-w-3xl space-y-4 pt-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className="w-full tablet:max-w-[75%]">
                {/*
                  Sem `onOpenProduct`: a `ChatProductList` já embrulha cada
                  peça num `Link` para o detalhe. Navegar aqui também empilhava
                  duas entradas no histórico no mesmo clique, e o botão voltar
                  passava a precisar de dois toques para sair do detalhe.
                */}
                <ChatBubble
                  message={message}
                  streaming={message.id === streamingMessageId}
                  error={message.id === errorMessageId ? (errorText ?? undefined) : undefined}
                  onRetry={retry}
                />
                {/* FE-US027-3: o que a Vintex entendeu, com ponte para o catálogo. */}
                {message.role === 'vintex' && message.interpreted ? (
                  <InterpretedQueryChips
                    interpreted={message.interpreted}
                    onOpenCatalog={() =>
                      navigate(`${paths.catalog}${toCatalogSearch(message.interpreted!.filters)}`)
                    }
                  />
                ) : null}
                {message.role === 'vintex' && message.catalogQuery ? (
                  <div className="mt-3">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        navigate(`${paths.catalog}${toCatalogSearch({ q: message.catalogQuery })}`)
                      }
                    >
                      Buscar no catálogo
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={endOfMessagesRef} />
        </div>
      </div>

      <div className="border-t border-linha bg-papel px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 tablet:px-8 web:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <div
            className="mb-3 flex gap-2 overflow-x-auto pb-1 hide-scrollbar"
            aria-label="Sugestões para começar"
          >
            <FilterChip
              label="Tamanhos próximos"
              onToggle={() => handleChipClick('Mostrar opções em tamanhos próximos')}
            />
            <FilterChip
              label="Manter cor prata"
              onToggle={() => handleChipClick('Quero alternativas na cor prata')}
            />
            <FilterChip label="Até R$ 250" onToggle={() => handleChipClick('Tenho até R$ 250')} />
          </div>

          <form
            role="form"
            aria-label="Enviar mensagem"
            onSubmit={(event) => {
              event.preventDefault();
              handleSearchSubmit(draft);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              id="vintex-message"
              role="searchbox"
              aria-label="Buscar"
              rows={1}
              maxLength={280}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ajuste tamanho, cor, estilo ou preço..."
              className="min-h-[52px] max-h-28 min-w-0 flex-1 resize-none border border-linha bg-branco-quente px-3 py-3 text-body text-tinta placeholder:text-texto-auxiliar focus:border-verde-rs focus:outline-none focus:ring-2 focus:ring-verde-rs/30"
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={!draft.trim()}
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center border border-vermelho-escuro bg-vermelho-escuro text-branco-quente transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-branco-quente disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </form>
          <p className="mt-2 text-center text-label leading-relaxed text-texto-auxiliar">
            As sugestões consideram as peças disponíveis no catálogo.
          </p>
        </div>
      </div>
    </div>
  );
}
