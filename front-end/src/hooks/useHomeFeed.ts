import { useCallback, useEffect, useRef, useState } from 'react';
import { getFeedWithDetails } from '@/services/catalogService';
import {
  getRecommendationsWithDetails,
  type RecommendationsWithDetails,
} from '@/services/recommendationService';
import type { Paginated, ProductDetail } from '@/types/product';

/** De onde veio a primeira página: o "carregar mais" continua na mesma fonte. */
type FeedSource = 'recommendations' | 'feed';

/** `Recommendations` no formato da grade. `personalized` não muda o que se mostra. */
function toPage({
  items,
  page,
  pageSize,
  total,
}: RecommendationsWithDetails): Paginated<ProductDetail> {
  return { items, page, pageSize, total };
}

/**
 * Grade da Home (FE-US029-1, #325): decide a fonte, carrega a primeira página
 * e o "carregar mais". A página só desenha.
 *
 * - **Logado e sem categoria**: `getRecommendationsWithDetails` ("Garimpados
 *   para Você", RN-64), com o detalhe de cada peça para o card mostrar
 *   categoria e tamanho. `personalized: false` é o feed genérico que o back já devolve
 *   (RN-38), mostrado igual. Se a recomendação falhar, cai em
 *   `getFeedWithDetails()` sem erro (RN-38); erro só se o feed também falhar.
 * - **Com categoria ou deslogado**: `getFeedWithDetails`, como antes.
 * - O "carregar mais" usa a fonte que serviu a primeira página. Falha nele
 *   mantém os itens e liga `error` (a página mostra o aviso ao lado do botão).
 * - A fonte depende de `isAuthenticated` e `selectedCategory`; quando um dos
 *   dois muda no meio de uma requisição, a resposta velha é descartada.
 *
 * Sem cache entre telas: carrega no mount (voltar das preferências remonta a
 * Home e recarrega).
 *
 * Usage:
 *   const { feed, loading, error, hasMore, loadMore, reload } =
 *     useHomeFeed(isAuthenticated, selectedCategory);
 */
export function useHomeFeed(isAuthenticated: boolean, selectedCategory: string | undefined) {
  const [feed, setFeed] = useState<Paginated<ProductDetail> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const source = useRef<FeedSource>('feed');
  // Só a requisição mais recente escreve no estado.
  const latest = useRef(0);

  const reload = useCallback(() => {
    const request = ++latest.current;
    const isCurrent = () => request === latest.current;
    setLoading(true);
    setLoadingMore(false);
    setError(false);

    async function run() {
      if (isAuthenticated && !selectedCategory) {
        try {
          const page = toPage(await getRecommendationsWithDetails(1));
          if (!isCurrent()) return;
          source.current = 'recommendations';
          setFeed(page);
          return;
        } catch {
          // RN-38: sem recomendação, o feed genérico; nada de erro na tela.
        }
      }

      const page = await (selectedCategory
        ? getFeedWithDetails({ category: selectedCategory })
        : getFeedWithDetails());
      if (!isCurrent()) return;
      source.current = 'feed';
      setFeed(page);
    }

    run()
      .catch(() => {
        if (isCurrent()) setError(true);
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
  }, [isAuthenticated, selectedCategory]);

  useEffect(reload, [reload]);

  const loadMore = useCallback(async () => {
    if (!feed || loading || loadingMore) return;
    const request = latest.current;
    const nextPage = feed.page + 1;
    setLoadingMore(true);
    setError(false);

    try {
      const next =
        source.current === 'recommendations'
          ? toPage(await getRecommendationsWithDetails(nextPage))
          : await getFeedWithDetails({
              page: nextPage,
              ...(selectedCategory ? { category: selectedCategory } : {}),
            });
      if (request !== latest.current) return;
      setFeed((current) =>
        current ? { ...next, items: [...current.items, ...next.items] } : next,
      );
    } catch {
      if (request === latest.current) setError(true);
    } finally {
      if (request === latest.current) setLoadingMore(false);
    }
  }, [feed, loading, loadingMore, selectedCategory]);

  const hasItems = Boolean(feed && feed.items.length > 0);
  const hasMore = Boolean(feed && feed.items.length < feed.total);

  return { feed, loading, loadingMore, error, hasItems, hasMore, loadMore, reload };
}
