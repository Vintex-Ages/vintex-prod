import { OutfitSuggestionCard } from '@/components/vintex-ai/OutfitSuggestionCard';
import { ChatProductList } from '@/components/vintex-ai/ChatProductList';
import type { ChatMessage } from '@/types/vintex-ai';

/**
 * `message.createdAt` é ISO 8601, como o tipo declara desde o #199. Imprimir
 * a string crua colocava `2026-09-27T21:04:11.482Z` embaixo de cada mensagem
 * do usuário; o defeito ficava escondido enquanto a página montava a mensagem
 * com a palavra `agora` no lugar da data (#208 passou a usar a data de
 * verdade). Valor que não for data volta como veio, para a bolha nunca
 * mostrar `Invalid Date`.
 */
function formatarHorario(createdAt: string): string {
  const data = new Date(createdAt);
  if (Number.isNaN(data.getTime())) return createdAt;
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

type ChatBubbleProps = {
  message: ChatMessage;
  /** Texto ainda chegando aos poucos (a página é quem alimenta, ver #208). */
  streaming?: boolean;
  /** Presente = a resposta falhou; substitui o conteúdo normal pelo aviso + retry. */
  error?: string;
  /**
   * `'quota'` = cota do dia esgotada (FE-US027-5): o aviso vira `role="status"`
   * e o "Tentar de novo" some, porque repetir a pergunta não adianta.
   */
  errorReason?: 'quota';
  onRetry?: () => void;
  /** Repassado ao `onOpen` do `ChatProductList` quando `message.products` existe. */
  onOpenProduct?: (id: string) => void;
};

/**
 * Bolha de uma mensagem do chat da Vintex AI. O visual muda conforme
 * `message.role`:
 * - `user`: fundo vermelho-escuro, texto claro, mostra o horário.
 * - `vintex`: fundo claro com borda. Três estados adicionais, evolução do
 *   `#142` para o `#199`/streaming (`#208`):
 *   - `error`: substitui o conteúdo pela mensagem de falha + "Tentar de
 *     novo" (`onRetry`), em `vermelho-escuro` sobre `vermelho-suave`. Com
 *     `errorReason="quota"` (cota do dia esgotada) não há retry, e o aviso
 *     é `role="status"`.
 *   - `streaming`: mostra um cursor piscando ao fim do texto e liga
 *     `aria-live="polite"` no parágrafo, para leitores de tela anunciarem
 *     o texto chegando aos poucos.
 *   - `message.outfit` → compõe `OutfitSuggestionCard` (#139); `message.products`
 *     → compõe `ChatProductList` (peças reais, #209). Nenhum dos dois é
 *     reimplementado aqui.
 *
 * Componente de apresentação puro: não busca dados, não decide quando
 * streamar ou re-tentar — isso é da página (`#208`). Tipos vêm de
 * `@/types/vintex-ai` (#138, evoluído em #199).
 *
 * Usage:
 *   import { ChatBubble } from '@/components/vintex-ai/ChatBubble';
 *
 *   <ChatBubble message={message} streaming />
 *   <ChatBubble message={message} error="Falha ao responder." onRetry={tentarDeNovo} />
 *   <ChatBubble message={message} onOpenProduct={(id) => track(id)} />
 */
export function ChatBubble({
  message,
  streaming = false,
  error,
  errorReason,
  onRetry,
  onOpenProduct,
}: ChatBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="rounded-none bg-vermelho-escuro p-4 shadow-[6px_6px_0_0_theme(colors.vermelho-suave)]">
        <p className="text-label font-semibold uppercase text-branco-quente">Você</p>
        <p className="mt-2 text-body text-branco-quente">{message.text}</p>
        <p className="mt-2 text-label text-branco-quente/70">
          {formatarHorario(message.createdAt)}
        </p>
      </div>
    );
  }

  if (error) {
    const cotaEsgotada = errorReason === 'quota';
    return (
      <div
        className="rounded-none bg-vermelho-suave p-4"
        role={cotaEsgotada ? 'status' : undefined}
      >
        <p className="text-label font-semibold uppercase text-vermelho-escuro">Vintex</p>
        <p className="mt-2 text-body text-vermelho-escuro">{error}</p>
        {onRetry && !cotaEsgotada ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 text-body font-semibold text-vermelho-escuro underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
          >
            Tentar de novo
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-none border border-linha bg-branco-quente p-4">
      <p className="text-label font-semibold uppercase text-vermelho-escuro">Vintex</p>
      <p className="mt-2 text-body text-tinta" aria-live={streaming ? 'polite' : undefined}>
        {message.text}
        {streaming ? (
          <span
            aria-hidden="true"
            data-testid="chat-bubble-streaming-cursor"
            className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-vermelho-escuro align-middle"
          />
        ) : null}
      </p>
      {message.outfit ? <OutfitSuggestionCard suggestion={message.outfit} /> : null}
      {message.products && message.products.length > 0 ? (
        <div className="mt-4">
          <ChatProductList products={message.products} onOpen={onOpenProduct} />
        </div>
      ) : null}
    </div>
  );
}

export default ChatBubble;
