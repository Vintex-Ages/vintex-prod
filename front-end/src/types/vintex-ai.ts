import type { FilterParams, Product } from '@/types/product';

/**
 * Tipos do domínio "Vintex AI" (assistente de curadoria de looks e busca
 * conversacional).
 *
 * Contrato provisório: o endpoint real (`POST /api/ai/chat`, VS-027,
 * back-end#40) ainda não existe, o back tem só a abstração de provider
 * (`AIProvider.stream_interpret_search`, back-end#63), sem fornecedor de IA
 * escolhido (`UnavailableAIProvider` é o padrão ativo). Formato exato da
 * resposta HTTP (SSE assumido aqui) e nomes ainda não foram confirmados
 * com o par de back-end ver `vintexAiService.ts`.
 */

export type ChatRole = 'user' | 'vintex';

export type OutfitItemIcon = 'shirt' | 'pants' | 'bag';

export interface OutfitItem {
  id: string;
  label: string;
  /**
   * Ícone de categoria usado como placeholder visual da peça, enquanto não
   * há um serviço/CDN real de imagens de produto.
   */
  icon: OutfitItemIcon;
}

export interface OutfitSuggestion {
  title: string;
  description: string;
  items: OutfitItem[];
  note: string;
}

/**
 * O que a Vintex entendeu do pedido: o que virou filtro objetivo (RN-60,
 * ex.: cor, tamanho, categoria) e o que virou busca por similaridade
 * (RN-60, ex.: "estilo boho", sem correspondência exata em campo nenhum).
 */
export interface InterpretedQuery {
  filters: FilterParams;
  similarity?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** ISO 8601. Renomeado de `timestamp` nesta issue (#199) para bater com o contrato proposto ao back. */
  createdAt: string;
  text: string;
  /** Presente apenas em mensagens da Vintex que trazem uma sugestão de look. */
  outfit?: OutfitSuggestion;
  /**
   * Peças reais referenciadas pela resposta (RN-65). Vem sempre do chunk
   * `products`, nunca inferida do texto — ver `ChatChunk`.
   */
  products?: Product[];
  /** O que a Vintex entendeu do pedido (RN-60). Vem do chunk `interpreted`. */
  interpreted?: InterpretedQuery;
}

/**
 * Um pedaço da resposta em streaming de `vintexAiService.chat()`. A mesma
 * union serve pro mock e pra API real — quem consome nunca sabe qual dos
 * dois está por trás.
 */
export type ChatChunk =
  | { type: 'text'; delta: string }
  | { type: 'products'; products: Product[] }
  | { type: 'interpreted'; interpreted: InterpretedQuery }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface ChatRequest {
  messages: Pick<ChatMessage, 'role' | 'text'>[];
  signal?: AbortSignal;
}
