import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useFavorites } from '@/context/useFavorites';
import { listFavorites } from '@/services/favoriteService';
import type { UnavailableReason } from '@/types/cart';
import type { FavoriteProduct } from '@/types/favorite';
import type { ProductStatus } from '@/types/product';

export type FavoritesListState =
  | { status: 'loading' }
  | { status: 'error' }
  /** `page` é a última página carregada; `total`, o total do comprador no back. */
  | { status: 'ready'; items: FavoriteProduct[]; page: number; total: number };

/** Peça favoritada com o estado que o `CartItemRow` desenha. */
export interface FavoriteEntry {
  product: FavoriteProduct;
  /**
   * Motivo de a peça estar **Indisponível** (RN-44); ausente quando ela está
   * à venda e pode ir ao carrinho.
   */
  unavailable?: UnavailableReason;
}

/**
 * Traduz o `status` do back (`FavoriteProduct.status`, back-end#252) no motivo
 * que o `CartItemRow` conhece.
 *
 * **Anunciada** (`ativo`) está à venda. **Vendida** (`vendido`) e **Pausada**
 * (`despublicado`) têm nome próprio no `CONTEXT.md`. **Reservada**
 * (`reservado`) não é vendida nem pausada: a peça tem um Pedido aberto
 * esperando comprovante (back-end#247), por isso cai no rótulo genérico
 * "Indisponível" em vez de inventar um estado novo no componente. `rascunho`
 * nunca deveria chegar ao comprador, mas se chegar também não é comprável.
 */
function toUnavailable(status: ProductStatus): UnavailableReason | undefined {
  if (status === 'ativo') return undefined;
  if (status === 'vendido') return 'vendido';
  return 'pausado';
}

/**
 * Lista "Meus favoritos" do comprador logado (FE-US013-2, #329; RN-43/RN-44):
 * primeira página, "carregar mais" e remoção. A tela só desenha.
 *
 * - A ordem é a do service (mais recente primeiro, back-end#252); o hook não
 *   reordena.
 * - `status` de cada peça vira `unavailable`, e é o que desabilita a ação de
 *   carrinho — peça Indisponível é sinalizada, não escondida (RN-44).
 * - `remove()` usa o `toggle` do `FavoritesContext`, para o coração das outras
 *   telas acompanhar a remoção; a peça só sai da lista depois que a API
 *   confirma. Se falhar, a peça continua listada e o erro sobe para a tela.
 * - `loadMore()` acrescenta a próxima página. Falha nela não apaga a lista:
 *   vira `loadMoreError` e o botão continua lá para tentar de novo.
 * - `retry()` recomeça da primeira página, passando por `loading`.
 * - Resposta de consulta que ficou velha é descartada.
 *
 * O `userId` vem da sessão (`useAuth`), como no `useMyOrders`; a rota já está
 * atrás do `RequireAuth`.
 *
 * Usage:
 *   const { state, entries, hasMore, loadMore, retry, remove } = useFavoritesList();
 *   entries.map(({ product, unavailable }) => (
 *     <CartItemRow key={product.id} item={{ ...product, unavailable }} … />
 *   ));
 */
export function useFavoritesList() {
  const { user } = useAuth();
  const userId = user?.id;
  const { toggle } = useFavorites();
  const [state, setState] = useState<FavoritesListState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  // Só a consulta mais recente escreve; `busy` trava cliques repetidos antes do render.
  const latest = useRef(0);
  const busy = useRef(false);

  const loadFirstPage = useCallback(async () => {
    if (!userId) return;
    const request = ++latest.current;
    busy.current = false;
    setState({ status: 'loading' });
    setLoadingMore(false);
    setLoadMoreError(false);

    try {
      const { items, page, total } = await listFavorites(userId, 1);
      if (request === latest.current) setState({ status: 'ready', items, page, total });
    } catch {
      if (request === latest.current) setState({ status: 'error' });
    }
  }, [userId]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const hasMore = state.status === 'ready' && state.items.length < state.total;

  const loadMore = useCallback(async () => {
    if (!userId || state.status !== 'ready' || !hasMore || busy.current) return;
    busy.current = true;
    const request = latest.current;
    setLoadingMore(true);
    setLoadMoreError(false);

    try {
      const next = await listFavorites(userId, state.page + 1);
      if (request !== latest.current) return;
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              items: [...current.items, ...next.items],
              page: next.page,
              total: next.total,
            }
          : current,
      );
    } catch {
      if (request === latest.current) setLoadMoreError(true);
    } finally {
      if (request === latest.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, [userId, state, hasMore]);

  const retry = useCallback(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  /**
   * Tira a peça dos favoritos pelo contexto (otimista lá) e, confirmada a API,
   * da lista da tela. O favorito de outra aba some junto, porque `ids` é
   * compartilhado.
   */
  const remove = useCallback(
    async (productId: string) => {
      await toggle(productId);
      setState((current) =>
        current.status === 'ready'
          ? {
              ...current,
              items: current.items.filter((item) => item.id !== productId),
              total: Math.max(0, current.total - 1),
            }
          : current,
      );
    },
    [toggle],
  );

  const entries: FavoriteEntry[] =
    state.status === 'ready'
      ? state.items.map((product) => ({ product, unavailable: toUnavailable(product.status) }))
      : [];

  return { state, entries, hasMore, loadingMore, loadMoreError, loadMore, retry, remove };
}
