import { createContext, useContext } from 'react';

/**
 * Contexto de favoritos — objeto de contexto, tipo do valor e o hook
 * `useFavorites` (FE-SVC-favorites, issue #316).
 *
 * Separado de `FavoritesContext.tsx` pelo mesmo motivo do `useCart.ts`: a
 * regra `react-refresh/only-export-components` não deixa um arquivo exportar
 * componente e não-componente. Consumidores importam:
 *   - `FavoritesProvider` de `@/context/FavoritesContext`;
 *   - `useFavorites` daqui, `@/context/useFavorites`.
 */

export interface FavoritesContextValue {
  /** Ids das peças favoritadas. Vazio sem sessão. */
  ids: Set<string>;
  /**
   * Favorita ou tira dos favoritos, de forma otimista: `ids` muda na hora e
   * volta ao que era se a API falhar. Rejeita nesse caso (e sem sessão, com
   * `AUTH_REQUIRED`), para a tela avisar.
   */
  toggle: (productId: string) => Promise<void>;
  /** `true` enquanto carrega os favoritos depois do login. */
  loading: boolean;
}

export const FavoritesContext = createContext<FavoritesContextValue | null>(null);

/**
 * Lê o `FavoritesContext`. Lança se usado fora de um `<FavoritesProvider>`.
 *
 * Usage:
 *   const { ids, toggle } = useFavorites();
 *   <FavoriteButton active={ids.has(product.id)} onToggle={() => void toggle(product.id)} />
 */
export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext);

  if (!context) {
    throw new Error('useFavorites deve ser utilizado dentro de FavoritesProvider');
  }

  return context;
}
