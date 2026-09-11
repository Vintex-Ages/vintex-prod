import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import Avatar from '@/components/common/Avatar';
import Button from '@/components/common/Button';
import { FavoriteButton } from '@/components/common/FavoriteButton';
import VerifiedBadge from '@/components/common/VerifiedBadge';
import { CatalogError, getProduct } from '@/services/catalogService';
import type { ProductDetail as ProductDetailData } from '@/types/product';

type Status = 'loading' | 'not_found' | 'error' | 'ready';

const priceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Ainda não existe página de perfil do brechó no projeto — placeholder até essa rota existir. */
function preventLinkActivation(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
}

function Attribute({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-label uppercase tracking-wide text-texto-auxiliar">{label}</dt>
      <dd className="text-body text-tinta">{value}</dd>
    </div>
  );
}

/**
 * Página de detalhe do produto (FE-US012-1). Busca via `catalogService.getProduct(id)`
 * e exibe a ficha completa — categoria, tamanho, cor, marca, conservação, cidade,
 * preço em destaque e descrição — mais o card da loja.
 *
 * Sem galeria de múltiplas fotos (fica pra FE-US012-2, #85) e sem persistência de
 * favorito (a ação com barreira de login é a FE-US012-5, #88) — aqui é só toggle
 * visual local.
 *
 * Usage:
 *   import ProductDetail from '@/pages/ProductDetail';
 *   <Route path={paths.product} element={<ProductDetail />} />
 */
function ProductDetail() {
  const { id } = useParams<{ id: string }>();

  const [product, setProduct] = useState<ProductDetailData | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [favorited, setFavorited] = useState(false);

  useEffect(() => {
    if (!id) {
      setStatus('not_found');
      return undefined;
    }

    let active = true;
    setStatus('loading');

    getProduct(id)
      .then((data) => {
        if (!active) return;
        setProduct(data);
        setStatus('ready');
      })
      .catch((error) => {
        if (!active) return;
        const notFound = error instanceof CatalogError && error.code === 'PRODUCT_NOT_FOUND';
        setStatus(notFound ? 'not_found' : 'error');
      });

    return () => {
      active = false;
    };
  }, [id]);

  if (status === 'loading') {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <p className="text-body text-texto-auxiliar">Carregando produto...</p>
      </main>
    );
  }

  if (status === 'not_found') {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <p role="alert" className="text-body text-tinta">
          Produto não encontrado.
        </p>
      </main>
    );
  }

  if (status === 'error' || !product) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <p role="alert" className="text-body text-tinta">
          Não foi possível carregar este produto agora.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-28 web:pb-6">
      <div className="aspect-square w-full bg-linha web:aspect-[4/3]">
        {product.coverImageUrl ? (
          <img
            src={product.coverImageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            role="img"
            aria-label={product.name}
            className="flex h-full w-full items-center justify-center text-texto-auxiliar"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-16 w-16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16.5 8.5 12l3 3L16 10.5 20 15M4 6h16v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6Z"
              />
            </svg>
          </div>
        )}
      </div>

      <h1 className="mt-4 font-display text-h2 text-tinta">{product.name}</h1>
      <p className="mt-1 font-display text-h2 font-semibold text-tinta">
        {priceFormatter.format(product.price)}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-linha pt-6 web:grid-cols-3">
        <Attribute label="Categoria" value={product.category} />
        <Attribute label="Tamanho" value={product.size} />
        <Attribute label="Cor" value={product.color} />
        <Attribute label="Marca" value={product.brand} />
        <Attribute label="Conservação" value={product.condition} />
        <Attribute label="Cidade" value={product.store.city ?? '—'} />
      </dl>

      <p className="mt-6 text-body text-texto-auxiliar">{product.description}</p>

      <a
        href="#"
        onClick={preventLinkActivation}
        className="mt-8 flex items-center gap-3 border border-linha bg-branco-quente p-4 no-underline hover:bg-papel-profundo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
      >
        <Avatar name={product.store.name} src={product.store.logoUrl} />
        <div className="flex flex-1 flex-col">
          <span className="text-body font-medium text-tinta">{product.store.name}</span>
          {product.store.city ? (
            <span className="text-label text-texto-auxiliar">{product.store.city}</span>
          ) : null}
        </div>
        <VerifiedBadge verified={Boolean(product.store.verified)} />
      </a>

      <div className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t border-linha bg-branco-quente p-4 web:static web:mt-8 web:border-0 web:p-0">
        <FavoriteButton active={favorited} onToggle={() => setFavorited((value) => !value)} />
        <Button variant="primary" fullWidth className="uppercase tracking-wide">
          Tenho interesse
        </Button>
      </div>
    </main>
  );
}

export default ProductDetail;
