/**
 * Contrato do look: peças que combinam com uma peça (FE-SVC-combinations,
 * issue #428, back-end#328).
 *
 * Combinação (RN-63): itens complementares, sempre de categoria diferente da
 * peça de origem, inclusive de outras lojas, com o valor total do conjunto. É
 * por semelhança entre peças, nunca por "quem comprou X levou Y" (RN-62).
 */

/** Mesmos valores do feed e da conversa: combinação de verdade ou o que sobrou (RN-61). */
export type LookMatchType = 'exact' | 'fallback';

/** Peça sugerida: sempre `ativo`, existente no catálogo, com preço e loja conferidos (RN-65). */
export interface LookPiece {
  id: string;
  name: string;
  /** Em reais, como no catálogo. */
  price: number;
  /** Sempre diferente da categoria da peça de origem. */
  category: string;
  coverImageUrl: string | null;
  /** A loja de cada peça: o conjunto pode atravessar lojas, e cada loja vira um pedido. */
  store: { id: string; name: string };
}

export interface LookSuggestion {
  pieces: LookPiece[];
  matchType: LookMatchType;
  /** Soma dos preços de `pieces`, em reais. */
  totalAmount: number;
}
