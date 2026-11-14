import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoreProducts, searchStores } from '@/services/storeService';
import type { Product } from '@/types/product';
import type { StoreSummary } from '@/types/store';

/**
 * Espera depois da última tecla antes de consultar `searchStores` (#330). O
 * campo não dispara uma busca por caractere: "Redenção" gera uma consulta, não
 * oito.
 */
export const STORE_SEARCH_DEBOUNCE_MS = 300;

/** A prévia do `StoreCard` mostra no máximo duas peças (FE-CMP-38); pedir mais seria desperdício. */
const PREVIEW_SIZE = 2;

export type StoreSearchState =
  | { status: 'loading' }
  | { status: 'error' }
  /** `page` é a última página carregada; `total`, o total de brechós no back. */
  | { status: 'ready'; stores: StoreSummary[]; page: number; total: number };

/** Prévia de peças por loja: id da loja -> até duas peças. */
export type StorePreviews = Record<string, Product[]>;

export interface UseStoreSearchResult {
  /** O que está no campo de busca (muda a cada tecla). */
  term: string;
  setTerm: (value: string) => void;
  /** Termo efetivamente consultado — o mesmo que vai no link do catálogo. */
  query: string;
  state: StoreSearchState;
  previews: StorePreviews;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
  loadMore: () => void;
  retry: () => void;
  /** Busca agora, sem esperar o debounce (Enter no campo). */
  submitTerm: () => void;
}

/**
 * Busca de brechós por nome (FE-US011-1, #330), para a página "Brechós do RS".
 * O service já existe (`searchStores`, FE-SVC-store-search #317): aqui ficam o
 * debounce do campo, a paginação e a prévia de peças de cada cartão — a tela
 * só desenha.
 *
 * - Termo vazio lista todos: `searchStores('', 1)` (back-end#256).
 * - Cada tecla reinicia o debounce; só o último termo é consultado.
 * - `loadMore()` acrescenta a próxima página sem apagar a lista; falha nela vira
 *   `loadMoreError` e o botão continua disponível.
 * - `retry()` refaz a primeira página, passando por `loading`.
 * - Consulta que ficou velha (termo novo digitado no meio) é descartada.
 * - Falha na prévia de uma loja não derruba o cartão nem a página: aquele
 *   cartão fica sem prévia.
 *
 * Usage:
 *   const { term, setTerm, state, previews, loadMore } = useStoreSearch();
 *   state.status === 'ready' && state.stores.map((loja) => (
 *     <StoreCard key={loja.id} store={loja} preview={previews[loja.id]} onOpen={abrir} />
 *   ))
 */
export function useStoreSearch(): UseStoreSearchResult {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState<StoreSearchState>({ status: 'loading' });
  const [previews, setPreviews] = useState<StorePreviews>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  // Só a consulta mais recente escreve; `busy` trava cliques repetidos antes do render.
  const latest = useRef(0);
  const busy = useRef(false);

  /**
   * Debounce do campo. Termo igual ao já consultado não agenda nada, então a
   * carga inicial (termo e `query` vazios) acontece na hora, sem espera.
   */
  useEffect(() => {
    const next = term.trim();
    if (next === query) return undefined;
    const timer = window.setTimeout(() => setQuery(next), STORE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [term, query]);

  const loadFirstPage = useCallback(async () => {
    const request = ++latest.current;
    busy.current = false;
    setState({ status: 'loading' });
    setPreviews({});
    setLoadingMore(false);
    setLoadMoreError(false);

    try {
      const { items, page, total } = await searchStores(query, 1);
      if (request !== latest.current) return;
      setState({ status: 'ready', stores: items, page, total });

      const loaded = await fetchPreviews(items);
      if (request !== latest.current) return;
      setPreviews((current) => ({ ...current, ...loaded }));
    } catch {
      if (request === latest.current) setState({ status: 'error' });
    }
  }, [query]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const hasMore = state.status === 'ready' && state.stores.length < state.total;

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready' || !hasMore || busy.current) return;
    busy.current = true;
    const request = latest.current;
    setLoadingMore(true);
    setLoadMoreError(false);

    try {
      const next = await searchStores(query, state.page + 1);
      if (request !== latest.current) return;
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              stores: [...current.stores, ...next.items],
              page: next.page,
              total: next.total,
            }
          : current,
      );

      const loaded = await fetchPreviews(next.items);
      if (request !== latest.current) return;
      setPreviews((current) => ({ ...current, ...loaded }));
    } catch {
      if (request === latest.current) setLoadMoreError(true);
    } finally {
      if (request === latest.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, [query, state, hasMore]);

  const retry = useCallback(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const submitTerm = useCallback(() => {
    setQuery(term.trim());
  }, [term]);

  const requestMore = useCallback(() => {
    void loadMore();
  }, [loadMore]);

  return {
    term,
    setTerm,
    query,
    state,
    previews,
    hasMore,
    loadingMore,
    loadMoreError,
    loadMore: requestMore,
    retry,
    submitTerm,
  };
}

/**
 * Prévia de cada loja da página, em paralelo. A falha de uma loja vira prévia
 * vazia: o cartão continua na lista, só sem as fotos.
 */
async function fetchPreviews(stores: StoreSummary[]): Promise<StorePreviews> {
  const entries = await Promise.all(
    stores.map(async (store) => {
      try {
        const { items } = await getStoreProducts(store.id, { page: 1, pageSize: PREVIEW_SIZE });
        return [store.id, items] as const;
      } catch {
        return [store.id, [] as Product[]] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as StorePreviews;
}
