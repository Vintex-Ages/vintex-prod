import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/useAuth';
import { addItem, getCart, removeItem } from '@/services/cartService';
import { AUTH_REQUIRED, type ApiError } from '@/types/auth';
import type { Cart } from '@/types/cart';
import { CartContext, type CartContextValue } from './useCart';

/**
 * Provider do carrinho (FE-SVC-cart, issue #204).
 *
 * Mantém `cart` em estado React, sincronizado com a sessão de autenticação:
 * carrega o carrinho automaticamente ao logar e o limpa imediatamente ao
 * deslogar (sem esperar nenhuma chamada assíncrona).
 *
 * Depende de `useAuth()` para saber `isAuthenticated` e o `user.id` passado
 * ao `cartService`, então precisa estar aninhado dentro de um `<AuthProvider>`.
 * Usar o `user.id` do contexto (e não `authService.me()`) mantém o carrinho
 * funcionando depois de um F5 no modo mock: o `AuthContext` restaura a sessão
 * do `sessionStorage`, mas o mock de auth só guarda a sessão em memória.
 *
 * Falhas no carregamento (`refresh`) não rejeitam: ficam em `error`, para a
 * interface mostrar o estado de erro. `add`/`remove` continuam rejeitando,
 * para quem dispara a ação decidir o feedback (ex.: toast).
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

/** Normaliza o que o `cartService` rejeitou para um `ApiError`. */
function toCartError(error: unknown): ApiError {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    return error as ApiError;
  }
  return {
    code: 'API_ERROR',
    message: error instanceof Error ? error.message : 'Não foi possível carregar o carrinho.',
  };
}

const NOT_AUTHENTICATED: ApiError = {
  code: AUTH_REQUIRED,
  message: 'É necessário estar autenticado.',
};

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const userId = isAuthenticated && user ? user.id : null;

  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    if (userId === null) {
      setCart(null);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const nextCart = await getCart(userId);
      setCart(nextCart);
      setError(null);
    } catch (refreshError) {
      setError(toCartError(refreshError));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const add = useCallback(
    async (productId: string) => {
      if (userId === null) {
        throw NOT_AUTHENTICATED;
      }
      const nextCart = await addItem(userId, productId);
      setCart(nextCart);
    },
    [userId],
  );

  const remove = useCallback(
    async (productId: string) => {
      if (userId === null) {
        throw NOT_AUTHENTICATED;
      }
      const nextCart = await removeItem(userId, productId);
      setCart(nextCart);
    },
    [userId],
  );

  /**
   * Reage à sessão de autenticação: ao logar, carrega o carrinho; ao
   * deslogar, limpa `cart` na hora, mesmo espírito do logout do AuthContext.
   */
  useEffect(() => {
    if (userId !== null) {
      void refresh();
    } else {
      setCart(null);
      setError(null);
    }
  }, [userId, refresh]);

  const count = useMemo(
    () => (cart ? cart.groups.reduce((total, group) => total + group.items.length, 0) : 0),
    [cart],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      count,
      loading,
      error,
      add,
      remove,
      refresh,
    }),
    [cart, count, loading, error, add, remove, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
