import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/useAuth';
import { addFavorite, listFavoriteIds, removeFavorite } from '@/services/favoriteService';
import { AUTH_REQUIRED, type ApiError } from '@/types/auth';
import { FavoritesContext, type FavoritesContextValue } from './useFavorites';

/**
 * Provider de favoritos (FE-SVC-favorites, issue #316).
 *
 * Estado global justificado: a grade do catálogo, o detalhe da peça e a
 * página de favoritos precisam saber quais peças estão favoritadas. Carrega
 * os ids ao logar e limpa ao deslogar, como o `CartProvider`. Favoritar exige
 * login (RN-27): quem chama usa `useProtectedAction` antes do `toggle`.
 *
 * Falha ao carregar não quebra a tela: os corações ficam vazios.
 *
 * Usage:
 *   <AuthProvider>
 *     <FavoritesProvider>
 *       <AppRoutes />
 *     </FavoritesProvider>
 *   </AuthProvider>
 */

const NOT_AUTHENTICATED: ApiError = {
  code: AUTH_REQUIRED,
  message: 'É necessário estar autenticado.',
};

/** Cópia de `ids` com a peça marcada ou desmarcada. */
function withFavorite(ids: Set<string>, productId: string, favorite: boolean): Set<string> {
  const next = new Set(ids);
  if (favorite) next.add(productId);
  else next.delete(productId);
  return next;
}

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const userId = isAuthenticated && user ? user.id : null;

  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  // Estado mais recente para o `toggle` decidir sem esperar o render.
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    if (userId === null) {
      setIds(new Set());
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    listFavoriteIds(userId)
      .then((loaded) => {
        if (active) setIds(loaded);
      })
      .catch(() => {
        if (active) setIds(new Set());
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const toggle = useCallback(
    async (productId: string) => {
      if (userId === null) throw NOT_AUTHENTICATED;

      const wasFavorite = idsRef.current.has(productId);
      const optimistic = withFavorite(idsRef.current, productId, !wasFavorite);
      idsRef.current = optimistic;
      setIds(optimistic);

      try {
        if (wasFavorite) await removeFavorite(userId, productId);
        else await addFavorite(userId, productId);
      } catch (error) {
        // Desfaz só esta peça: outro toggle pode ter mudado as demais no meio.
        const reverted = withFavorite(idsRef.current, productId, wasFavorite);
        idsRef.current = reverted;
        setIds(reverted);
        throw error;
      }
    },
    [userId],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({ ids, toggle, loading }),
    [ids, toggle, loading],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}
