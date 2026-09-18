import { createContext, useContext } from 'react';
import type { Cart } from '@/types/cart';

/**
 * Contexto do carrinho — objeto de contexto, tipo do valor e o hook `useCart`
 * (FE-SVC-cart, issue #204).
 *
 * Fica separado de `CartContext.tsx` de propósito: aquele arquivo exporta o
 * componente `CartProvider`, e a regra `react-refresh/only-export-components`
 * (com `--max-warnings 0`) não permite um mesmo arquivo exportar componente e
 * não-componente. Consumidores importam:
 *   - `CartProvider` de `@/context/CartContext`;
 *   - `useCart` daqui, `@/context/useCart`.
 */

/** Valor exposto pelo `CartContext` / retorno de `useCart()`. */
export interface CartContextValue {
  /** Carrinho atual, agrupado por loja, ou `null` sem sessão/antes da primeira carga. */
  cart: Cart | null;
  /** Derivado: soma de itens de todos os grupos (0 quando `cart` é `null`). */
  count: number;
  /** `true` enquanto o Provider busca o carrinho. */
  loading: boolean;
  /** Adiciona a peça ao carrinho e substitui `cart` pelo resultado devolvido. */
  add: (productId: string) => Promise<void>;
  /** Remove a peça do carrinho e substitui `cart` pelo resultado devolvido. */
  remove: (productId: string) => Promise<void>;
  /** Recarrega o carrinho a partir do backend/mock. */
  refresh: () => Promise<void>;
}

export const CartContext = createContext<CartContextValue | null>(null);

/**
 * Lê o `CartContext`. Lança se usado fora de um `<CartProvider>`.
 *
 * Usage:
 *   const { cart, count, add, remove } = useCart();
 */
export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (context === null) {
    throw new Error('useCart deve ser usado dentro de um <CartProvider>.');
  }
  return context;
}
