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
  // Escritas feitas desde o início da carga. A lista do back pode ter saído
  // antes delas (ex.: a ação retomada depois do login favorita enquanto a
  // carga corre); sem reaplicá-las, a carga apagaria o coração recém-marcado.
  const writesRef = useRef(new Map<string, boolean>());

  const applyWrites = useCallback((base: Set<string>) => {
    let next = base;
    writesRef.current.forEach((favorite, productId) => {
      next = withFavorite(next, productId, favorite);
    });
    idsRef.current = next;
    setIds(next);
  }, []);

  useEffect(() => {
    writesRef.current = new Map();
    if (userId === null) {
      setIds(new Set());
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    listFavoriteIds(userId)
      .then((loaded) => {
        if (active) applyWrites(loaded);
      })
      .catch(() => {
        if (active) applyWrites(new Set());
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, applyWrites]);

  const setFavorite = useCallback(
    async (productId: string, favorite: boolean) => {
      if (userId === null) throw NOT_AUTHENTICATED;

      const wasFavorite = idsRef.current.has(productId);
      const optimistic = withFavorite(idsRef.current, productId, favorite);
      idsRef.current = optimistic;
      writesRef.current.set(productId, favorite);
      setIds(optimistic);

      try {
        // Chama a API mesmo se `ids` já concorda: `ids` pode estar vazio por
        // carga em curso ou falha, e as duas rotas são idempotentes no back.
        if (favorite) await addFavorite(userId, productId);
        else await removeFavorite(userId, productId);
      } catch (error) {
        // Desfaz só esta peça: outro toggle pode ter mudado as demais no meio.
        const reverted = withFavorite(idsRef.current, productId, wasFavorite);
        idsRef.current = reverted;
        writesRef.current.set(productId, wasFavorite);
        setIds(reverted);
        throw error;
      }
    },
    [userId],
  );

  const toggle = useCallback(
    (productId: string) => setFavorite(productId, !idsRef.current.has(productId)),
    [setFavorite],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({ ids, toggle, setFavorite, loading }),
    [ids, toggle, setFavorite, loading],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}
