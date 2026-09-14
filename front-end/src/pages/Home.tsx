import { useEffect, useState } from 'react';
import Button from '@/components/common/Button';
import { ProductGrid } from '@/components/product/ProductGrid';
import { productDetail } from '@/routes/paths';
import { getFeed } from '@/services/catalogService';
import type { Paginated, Product } from '@/types/product';

function Home() {
  const [feed, setFeed] = useState<Paginated<Product> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    getFeed()
      .then(setFeed)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  async function loadMore() {
    if (!feed || loading || loadingMore) return;
    setLoadingMore(true);
    setError(false);
    try {
      const next = await getFeed({ page: feed.page + 1 });
      setFeed({ ...next, items: [...feed.items, ...next.items] });
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="mb-6">
        <h1 className="font-display text-h1 text-tinta">Feed de achados</h1>
        {/*
          Contador do Figma (nó 592:1415). Só aparece com resultado: com zero,
          empilharia "0 peças encontradas" logo acima do estado vazio.
        */}
        {feed && feed.total > 0 && (
          <p className="mt-1 font-ui text-body text-texto-auxiliar">
            {feed.total === 1 ? '1 peça encontrada' : `${feed.total} peças encontradas`}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-4 font-ui text-body text-vermelho-escuro">
          Não foi possível carregar as peças.
        </p>
      )}
      <section aria-label="Feed de peças" aria-busy={loading || loadingMore}>
        {(loading || loadingMore) && <p role="status">Carregando peças...</p>}
        {(feed || loading) && (
          <ProductGrid
            products={feed?.items ?? []}
            loading={loading}
            productPath={productDetail}
            // Com `productPath` real, quem navega é o `<Link>` do cartão. Navegar
            // aqui também empilharia duas entradas no histórico e o "voltar" não
            // sairia da peça; `onOpen` fica como ponto de telemetria.
            onOpen={() => {}}
          />
        )}
      </section>
      {feed && feed.items.length < feed.total && (
        <Button className="mt-6" disabled={loading || loadingMore} onClick={loadMore}>
          Carregar mais achados
        </Button>
      )}
    </main>
  );
}

export default Home;
