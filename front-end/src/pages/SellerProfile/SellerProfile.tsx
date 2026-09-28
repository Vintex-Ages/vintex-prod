import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Avatar from '@/components/common/Avatar';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import VerifiedBadge from '@/components/common/VerifiedBadge';
import Container from '@/components/layout/Container';
import { ProductGrid } from '@/components/product/ProductGrid';
import NotFound from '@/pages/NotFound/NotFound';
import { productDetail } from '@/routes/paths';
import { getStore, getStoreProducts, StoreError } from '@/services/storeService';
import type { Paginated, Product } from '@/types/product';
import type { StoreProfile } from '@/types/store';

type Status = 'loading' | 'not_found' | 'error' | 'ready';

const PAGE_SIZE = 20;

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 0,
});

function StoreMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border border-linha bg-branco-quente p-4">
      <span className="text-label text-texto-auxiliar">{label}</span>
      <span className="text-h4 font-bold text-tinta">{value}</span>
    </div>
  );
}

/**
 * Perfil público da loja (FE-US007-2). Busca via `storeService.getStore(id)` +
 * `getStoreProducts(id)`; não exige login (rota pública em `AppRoutes.tsx`).
 * Métricas indisponíveis (avaliação, taxa de envio) mostram "Em breve" — nunca
 * um zero falso (RN-74).
 *
 * Usage:
 *   <Route path={paths.store} element={<SellerProfile />} />
 */
function SellerProfile() {
  const { id } = useParams<{ id: string }>();

  const [store, setStore] = useState<StoreProfile | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const [products, setProducts] = useState<Product[]>([]);
  const [productsPage, setProductsPage] = useState<Paginated<Product> | null>(null);
  const [productsError, setProductsError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const loadStore = useCallback(() => {
    if (!id) {
      setStatus('not_found');
      return;
    }
    setStatus('loading');
    getStore(id)
      .then((data) => {
        setStore(data);
        setStatus('ready');
      })
      .catch((error) => {
        const notFound = error instanceof StoreError && error.code === 'STORE_NOT_FOUND';
        setStatus(notFound ? 'not_found' : 'error');
      });
  }, [id]);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  /** Primeira página das peças. Falha vira estado de erro com retry, nunca carregamento eterno. */
  const loadProducts = useCallback(() => {
    if (!id) return;
    setProductsError(false);
    setProductsPage(null);
    getStoreProducts(id, { page: 1, pageSize: PAGE_SIZE })
      .then((page) => {
        setProducts(page.items);
        setProductsPage(page);
      })
      .catch(() => setProductsError(true));
  }, [id]);

  useEffect(() => {
    if (status === 'ready') loadProducts();
  }, [status, loadProducts]);

  function loadMore() {
    if (!id || !productsPage) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    getStoreProducts(id, { page: productsPage.page + 1, pageSize: PAGE_SIZE })
      .then((page) => {
        setProducts((current) => [...current, ...page.items]);
        setProductsPage(page);
      })
      .catch(() => setLoadMoreError(true))
      .finally(() => setLoadingMore(false));
  }

  if (status === 'loading') {
    return (
      <Container as="main" className="py-10">
        <p role="status" className="text-body text-texto-auxiliar">
          Carregando loja...
        </p>
      </Container>
    );
  }

  // Loja inexistente cai no 404 do app, como qualquer endereço que não existe (#223).
  if (status === 'not_found') {
    return <NotFound />;
  }

  if (status === 'error' || !store) {
    return (
      <Container as="main" className="py-10">
        <ErrorState message="Não foi possível carregar esta loja agora." onRetry={loadStore} />
      </Container>
    );
  }

  const hasMore = productsPage ? products.length < productsPage.total : false;

  return (
    <Container as="main" className="flex flex-col gap-8 py-6 web:py-10">
      <div className="flex flex-col items-start gap-4 border-b border-linha pb-6 tablet:flex-row tablet:items-center">
        <Avatar name={store.name} src={store.logoUrl} />

        <div className="flex flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-h2 text-tinta">{store.name}</h1>
            <VerifiedBadge verified={store.verification === 'confiavel'} label="Confiável" />
          </div>
          {store.city ? <p className="text-body-sm text-texto-auxiliar">{store.city}</p> : null}
          <p className="mt-2 max-w-prose text-body text-tinta">{store.description}</p>
        </div>
      </div>

      {store.metrics ? (
        <section
          aria-label="Métricas da loja"
          className="grid grid-cols-2 gap-4 tablet:grid-cols-3 web:grid-cols-5"
        >
          <StoreMetric label="Peças ativas" value={String(store.metrics.activeProducts)} />
          <StoreMetric label="Peças vendidas" value={String(store.metrics.soldProducts)} />
          <StoreMetric label="Na Vintex" value={`${store.metrics.monthsOnPlatform} meses`} />
          <StoreMetric
            label="Sem reclamação de envio"
            value={
              store.metrics.shippingWithoutComplaintRate !== undefined
                ? percentFormatter.format(store.metrics.shippingWithoutComplaintRate)
                : 'Em breve'
            }
          />
          <StoreMetric
            label="Avaliação"
            value={
              store.metrics.rating !== undefined ? store.metrics.rating.toFixed(1) : 'Em breve'
            }
          />
        </section>
      ) : null}

      <section aria-label="Peças da loja" className="flex flex-col gap-6">
        <h2 className="font-display text-h3 text-tinta">Peças</h2>

        {productsError ? (
          <ErrorState
            message="Não foi possível carregar as peças desta loja agora."
            onRetry={loadProducts}
          />
        ) : (
          <ProductGrid
            products={products}
            loading={productsPage === null}
            onOpen={() => {}}
            productPath={(productId) => productDetail(productId)}
            emptyState={<EmptyState message="Essa loja ainda não tem peças ativas." />}
          />
        )}

        {loadMoreError ? (
          <p role="alert" className="text-body-sm text-vermelho-escuro">
            Não foi possível carregar mais peças. Tente de novo.
          </p>
        ) : null}

        {hasMore && !productsError ? (
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Carregando...' : 'Carregar mais'}
          </Button>
        ) : null}
      </section>
    </Container>
  );
}

export default SellerProfile;
