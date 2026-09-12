import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/common/Button';
import { ProductGrid } from '@/components/product/ProductGrid';
import { productDetail } from '@/routes/paths';
import { getFeed } from '@/services/catalogService';
import type { Paginated, Product } from '@/types/product';

function Home() {
  const navigate = useNavigate();
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
      <h1 className="mb-6 font-display text-h1 text-tinta">Início</h1>
      {error && <p role="alert">Não foi possível carregar as peças.</p>}
      <section aria-label="Feed de peças" aria-busy={loading || loadingMore}>
        {(loading || loadingMore) && <p role="status">Carregando peças...</p>}
        {(feed || loading) && (
          <ProductGrid
            products={feed?.items ?? []}
            loading={loading}
            onOpen={(id) => navigate(productDetail(id))}
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
