import type { Product, Store } from '@/types/product';

/**
 * Contrato do carrinho (FE-SVC-cart, issue #204).
 *
 * DECISÃO: `Cart` não tem `totalCents` no nível raiz, mesmo o exemplo de
 * interface da issue mostrando `Cart { items: CartItem[]; totalCents: number }`
 * (uma lista plana, com um único total). Os CRITÉRIOS DE ACEITE da mesma issue
 * dizem explicitamente que "o Cart devolve os itens agrupados por loja, com
 * subtotal por loja... SEM total único cruzando lojas" — e os critérios de
 * aceite têm prioridade sobre o exemplo ilustrativo. Por isso o carrinho é
 * `groups: CartGroup[]`, cada grupo com seu `subtotalCents`, e não existe soma
 * cruzando lojas neste tipo.
 */

/** Item do carrinho: a peça e quando foi adicionada. */
export interface CartItem {
  product: Product;
  /** Data/hora em que o item foi adicionado ao carrinho, em ISO 8601. */
  addedAt: string;
  /** `true` quando a peça não está mais disponível para compra (ex.: vendida). */
  unavailable?: boolean;
}

/** Itens do carrinho agrupados por loja, com subtotal próprio do grupo. */
export interface CartGroup {
  store: Store;
  items: CartItem[];
  /** Soma em centavos apenas dos itens do grupo sem `unavailable`. */
  subtotalCents: number;
}

/** Carrinho do usuário: só grupos por loja, sem total único entre lojas. */
export interface Cart {
  groups: CartGroup[];
}
