import type { ChatMessage } from '@/types/vintex-ai';
import { OutfitSuggestionCard } from '@/components/vintex-ai/OutfitSuggestionCard';

interface ChatBubbleProps {
  message: ChatMessage;
}

/**
 * Bolha de uma mensagem do chat da Vintex AI. O visual muda conforme
 * `message.role`:
 * - `user`: fundo vermelho-escuro, texto claro, mostra o horário.
 * - `vintex`: fundo claro com borda, e — quando a mensagem trouxer
 *   `outfit` — compõe o `OutfitSuggestionCard` (#139) para mostrar a
 *   sugestão de look, sem reimplementar esse card aqui.
 *
 * Componente de apresentação puro: não busca dados nem guarda estado —
 * lista de mensagens e histórico ficam na página que usa este componente.
 * Tipos vêm de `@/types/vintex-ai` (#138), não redeclarados.
 *
 * Usage:
 *   import { ChatBubble } from '@/components/vintex-ai/ChatBubble';
 *
 *   {messages.map((message) => (
 *     <ChatBubble key={message.id} message={message} />
 *   ))}
 */
export function ChatBubble({ message }: ChatBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="rounded-none bg-vermelho-escuro p-4 shadow-[6px_6px_0_0_theme(colors.vermelho-suave)]">
        <p className="text-label font-semibold uppercase text-branco-quente">Você</p>
        <p className="mt-2 text-body text-branco-quente">{message.text}</p>
        <p className="mt-2 text-label text-branco-quente/70">{message.timestamp}</p>
      </div>
    );
  }

  return (
    <div className="rounded-none border border-linha bg-branco-quente p-4">
      <p className="text-label font-semibold uppercase text-vermelho-escuro">Vintex</p>
      <p className="mt-2 text-body text-tinta">{message.text}</p>
      {message.outfit ? <OutfitSuggestionCard suggestion={message.outfit} /> : null}
    </div>
  );
}

export default ChatBubble;
