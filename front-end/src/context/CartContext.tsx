import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/useAuth';
import { addItem, getCart, removeItem } from '@/services/cartService';
import type { Cart } from '@/types/cart';
import { CartContext, type CartContextValue } from './useCart';

/**
 * Provider do carrinho (FE-SVC-cart, issue #204).
 *
 * Mantém `cart` em estado React, sincronizado com a sessão de autenticação:
 * carrega o carrinho automaticamente ao logar e o limpa imediatamente ao
 * deslogar (sem esperar nenhuma chamada assíncrona).
 *
 * Depende de `useAuth()` para saber `isAuthenticated`, então precisa estar
 * aninhado dentro de um `<AuthProvider>`.
 *
 * Usage:
 *   import { AuthProvider } from '@/context/AuthContext';
 *   import { CartProvider } from '@/context/CartContext';
 *   import { useCart } from '@/context/useCart';
 *
 *   function App() {
 *     return (
 *       <AuthProvider>
 *         <CartProvider>
 *           <AppRoutes />
 *         </CartProvider>
 *       </AuthProvider>
 *     );
 *   }
 *
 *   function CartBadge() {
 *     const { count } = useCart();
 *     return <span>{count}</span>;
 *   }
 */

export function CartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setCart(null);
      return;
    }

    setLoading(true);
    try {
      const nextCart = await getCart();
      setCart(nextCart);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const add = useCallback(async (productId: string) => {
    const nextCart = await addItem(productId);
    setCart(nextCart);
  }, []);

  const remove = useCallback(async (productId: string) => {
    const nextCart = await removeItem(productId);
    setCart(nextCart);
  }, []);

  /**
   * Reage à sessão de autenticação: ao logar, carrega o carrinho; ao
   * deslogar, limpa `cart` na hora, mesmo espírito do logout do AuthContext.
   */
  useEffect(() => {
    if (isAuthenticated) {
      void refresh();
    } else {
      setCart(null);
    }
  }, [isAuthenticated, refresh]);

  const count = useMemo(
    () => (cart ? cart.groups.reduce((total, group) => total + group.items.length, 0) : 0),
    [cart],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      count,
      loading,
      add,
      remove,
      refresh,
    }),
    [cart, count, loading, add, remove, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
