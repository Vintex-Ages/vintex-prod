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
  /**
   * A pergunta, quando a Vintex não achou peça nenhuma: a tela oferece
   * buscá-la no catálogo em vez de deixar a conversa sem saída (VS-024).
   */
  catalogQuery?: string;
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
  /**
   * `reason: 'quota'` = cota do dia do chat esgotada (FE-US027-5): não adianta
   * tentar de novo. `retryAt` (ISO 8601) é quando ela volta, se o back mandar.
   */
  | { type: 'error'; reason?: 'quota'; message: string; retryAt?: string };

export interface ChatRequest {
  messages: Pick<ChatMessage, 'role' | 'text'>[];
  signal?: AbortSignal;
}

/**
 * Campos que a IA sabe sugerir a partir das fotos, e só eles: é exatamente o
 * que o `ImageAnalysisResult` do back devolve (`back-end#150`). Todos os seis
 * são chaves de `ProductInput` (`FE-SVC-seller-products`, #202), então a lista
 * que o formulário recebe em `suggested` encaixa direto nos campos dele.
 *
 * Declarado aqui como união própria em vez de `keyof ProductInput` por dois
 * motivos: `ProductInput` ainda não está na `develop` (vem no #202), e quem
 * decide o que pode ser sugerido é o back, não o tipo do formulário. `name`,
 * `price`, `style` e `images` ficam de fora porque a IA não os devolve — em
 * particular `price`, que depende da fonte de preço ainda não resolvida
 * (`SPIKE-01`), e `name`, que o vendedor sempre escreve.
 */
export type ListingSuggestionField =
  'category' | 'color' | 'size' | 'condition' | 'description' | 'brand';

export interface ListingSuggestion {
  /** Só os campos que a IA conseguiu preencher. */
  fields: Partial<Record<ListingSuggestionField, string>>;
  /** Quais vieram da IA, para a tela marcar cada um (RN-56). */
  suggested: ListingSuggestionField[];
  confidence?: Partial<Record<ListingSuggestionField, number>>;
  /** Ex.: 'Marca não identificada: etiqueta ilegível' (RN-58). */
  notes?: string[];
}

/**
 * Falha é resultado tipado, nunca exceção: o cadastro não trava por causa da
 * IA (RN-57). `invalid-image` cobre o que o front recusa antes de chamar (mais
 * fotos que o limite do back) e o que o back recusa no corpo.
 */
export type ListingSuggestionResult =
  | { ok: true; suggestion: ListingSuggestion }
  | { ok: false; reason: 'timeout' | 'unavailable' | 'invalid-image'; message: string };
