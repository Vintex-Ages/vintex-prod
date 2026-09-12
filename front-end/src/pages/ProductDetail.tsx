import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import Avatar from '@/components/common/Avatar';
import Button from '@/components/common/Button';
import { FavoriteButton } from '@/components/common/FavoriteButton';
import VerifiedBadge from '@/components/common/VerifiedBadge';
import Gallery from '@/components/product/Gallery';
import { paths } from '@/routes/paths';
import { CatalogError, getProduct } from '@/services/catalogService';
import type { ProductDetail as ProductDetailData } from '@/types/product';

type Status = 'loading' | 'not_found' | 'error' | 'ready';

const priceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Tamanhos por letra ganham o nome por extenso; numéricos (calçado) ficam como estão. */
const SIZE_LABELS: Record<string, string> = {
  P: 'Pequeno',
  M: 'Médio',
  G: 'Grande',
  GG: 'Extra Grande',
};

function sizeLabel(size: string): string {
  const label = SIZE_LABELS[size.toUpperCase()];
  return label ? `${size} (${label})` : size;
}

/** Ainda não existe página de perfil do brechó (nem de busca por cidade) — placeholder até essas rotas existirem. */
function preventLinkActivation(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
}

function Attribute({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-body text-texto-auxiliar">{label}</dt>
      <dd className="text-body font-semibold text-tinta">{value}</dd>
    </div>
  );
}

/**
 * Página de detalhe do produto (FE-US012-1). Busca via `catalogService.getProduct(id)`
 * e exibe a ficha completa — categoria, tamanho, cor, marca, conservação, cidade,
 * preço em destaque e descrição — mais o card da loja.
 *
 * Galeria de fotos (carrossel + miniaturas, ordenada por `position`) é o
 * componente `Gallery` (FE-US012-2, #85) — ver `@/components/product/Gallery`.
 * Sem curadoria de IA (#127/#139) e sem carrinho/checkout real (pagamento real fora
 * do escopo do projeto) — o botão de ação final não tem função real por trás, é
 * só layout. Sem persistência de favorito (a ação com barreira de login é a
 * FE-US012-5, #88) — aqui é só toggle visual local.
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
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <p className="text-body text-texto-auxiliar">Carregando produto...</p>
      </main>
    );
  }

  if (status === 'not_found') {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <p role="alert" className="text-body text-tinta">
          Produto não encontrado.
        </p>
      </main>
    );
  }

  if (status === 'error' || !product) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <p role="alert" className="text-body text-tinta">
          Não foi possível carregar este produto agora.
        </p>
      </main>
    );
  }

  const priceLabel = priceFormatter.format(product.price);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 web:py-10">
      <nav
        aria-label="Trilha"
        className="mb-4 flex flex-wrap items-center gap-1 text-label text-texto-auxiliar"
      >
        <Link to={paths.home} className="hover:text-tinta hover:underline">
          Início
        </Link>
        {product.store.city ? (
          <>
            <span aria-hidden="true">/</span>
            <span>{product.store.city}</span>
          </>
        ) : null}
        <span aria-hidden="true">/</span>
        <a href="#" onClick={preventLinkActivation} className="hover:text-tinta hover:underline">
          {product.store.name}
        </a>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="text-tinta">
          {product.name}
        </span>
      </nav>

      <div className="grid grid-cols-1 gap-8 web:grid-cols-2">
        <Gallery media={product.media} productName={product.name} />

        <div className="flex flex-col pb-28 web:pb-0">
          <h1 className="font-display text-h2 text-tinta">{product.name}</h1>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="text-2xl font-bold text-tinta">{priceLabel}</p>
            <p className="text-body text-texto-auxiliar">
              Tamanho: <span className="font-bold text-tinta">{sizeLabel(product.size)}</span>
            </p>
          </div>

          <a
            href="#"
            onClick={preventLinkActivation}
            className="mt-6 flex items-center gap-3 border border-linha bg-branco-quente p-4 no-underline hover:bg-papel-profundo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            <Avatar name={product.store.name} src={product.store.logoUrl} />
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-body font-medium text-tinta">{product.store.name}</span>
              <div className="flex flex-wrap items-center gap-2">
                <VerifiedBadge verified={Boolean(product.store.verified)} label="Confiável" />
                {product.store.city ? (
                  <span className="text-label text-texto-auxiliar">{product.store.city}</span>
                ) : null}
              </div>
            </div>
            <span className="shrink-0 border border-linha px-3 py-2 text-label font-bold uppercase tracking-wide text-tinta">
              Ver loja
            </span>
          </a>

          <h2 className="mt-8 text-lg font-bold text-tinta">História da Peça</h2>
          <p className="mt-2 text-body text-texto-auxiliar">{product.description}</p>

          <dl className="mt-6 divide-y divide-linha border-t border-linha">
            <Attribute label="Marca" value={product.brand} />
            <Attribute label="Estado" value={product.condition} />
            {product.material ? <Attribute label="Material" value={product.material} /> : null}
            {product.measurements ? (
              <Attribute label="Medidas" value={product.measurements} />
            ) : null}
            <Attribute label="Localização" value={product.store.city ?? '—'} />
          </dl>

          <div className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t border-linha bg-branco-quente p-4 web:static web:mt-8 web:border-0 web:p-0">
            <FavoriteButton active={favorited} onToggle={() => setFavorited((value) => !value)} />
            <Button variant="primary" fullWidth className="uppercase tracking-wide">
              Comprar Agora • {priceLabel}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default ProductDetail;
