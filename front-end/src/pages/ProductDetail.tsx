import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import Avatar from '@/components/common/Avatar';
import Button from '@/components/common/Button';
import ErrorState from '@/components/common/ErrorState';
import { FavoriteButton } from '@/components/common/FavoriteButton';
import LoginInterceptor from '@/components/common/LoginInterceptor';
import VerifiedBadge from '@/components/common/VerifiedBadge';
import Container from '@/components/layout/Container';
import Gallery from '@/components/product/Gallery';
import SoldBadge from '@/components/product/SoldBadge';
import { useProtectedAction } from '@/hooks/useProtectedAction';
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
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="shrink-0 text-body-sm text-texto-auxiliar">{label}</dt>
      <dd className="text-right text-body font-semibold text-tinta">{value}</dd>
    </div>
  );
}

/**
 * Página de detalhe do produto (FE-US012-1). Busca via `catalogService.getProduct(id)`
 * e exibe a ficha completa — categoria, tamanho, cor, marca, conservação, cidade,
 * preço em destaque e descrição — mais o card da loja.
 *
 * Galeria de fotos (carrossel + miniaturas, ordenada por `position`) é o
 * componente `Gallery` (FE-US012-2, #85). Sem curadoria de IA (#127/#139) e sem
 * carrinho/checkout real (pagamento real fora do escopo do projeto): o botão
 * "Comprar Agora" não dispara compra nenhuma, só a barreira de login
 * (FE-US012-5, #88) importa por enquanto.
 *
 * Barreira de login (FE-US012-5, #88): favoritar e comprar passam por
 * `useProtectedAction` — deslogado abre `LoginInterceptor` (compartilhado
 * entre os dois fluxos), logado executa a ação direto. O toggle de favorito
 * continua só local (sem persistência real).
 *
 * Sinalização de peça vendida (FE-US012-4, #87 → revisto em FE-US012-5, #88):
 * quando `status === 'vendido'`, mostra o `SoldBadge` junto do título/preço e
 * desabilita TANTO "Comprar Agora" quanto favoritar — a #87 tinha deixado só
 * o comprar desabilitado, decisão revertida pela #88.
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

  const productId = product?.id ?? '';

  /**
   * `intent`/`action` precisam manter identidade estável entre renders: o
   * `useEffect` de retomada do `useProtectedAction` roda de novo sempre que
   * essas referências mudam, e um objeto/função inline recriada a cada
   * render reexecutaria a ação já concluída (desfazendo o toggle).
   */
  const favoriteIntent = useMemo(() => ({ type: 'favorite', payload: { productId } }), [productId]);
  const toggleFavorite = useCallback(() => setFavorited((value) => !value), []);

  const buyIntent = useMemo(() => ({ type: 'buy', payload: { productId } }), [productId]);
  /** Não existe fluxo de compra real ainda (pagamento fora do escopo) — aqui só a barreira de login importa. */
  const noopBuy = useCallback(() => {}, []);

  const protectedFavorite = useProtectedAction({ intent: favoriteIntent, action: toggleFavorite });
  const protectedBuy = useProtectedAction({ intent: buyIntent, action: noopBuy });

  const activeIntercept = protectedFavorite.interceptorOpen
    ? protectedFavorite
    : protectedBuy.interceptorOpen
      ? protectedBuy
      : null;

  if (status === 'loading') {
    return (
      <Container as="main" className="py-10">
        <p role="status" className="text-body text-texto-auxiliar">
          Carregando produto...
        </p>
      </Container>
    );
  }

  if (status === 'not_found') {
    return (
      <Container as="main" className="py-10">
        <ErrorState
          title="Peça não encontrada"
          message="Esta peça não está mais no ar, ou o endereço está errado."
        />
      </Container>
    );
  }

  if (status === 'error' || !product) {
    return (
      <Container as="main" className="py-10">
        <ErrorState message="Não foi possível carregar esta peça agora." />
      </Container>
    );
  }

  const priceLabel = priceFormatter.format(product.price);

  return (
    <Container as="main" className="py-6 web:py-10">
      <nav
        aria-label="Trilha"
        className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-texto-auxiliar"
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
          {product.status === 'vendido' ? (
            <div className="mb-2">
              <SoldBadge />
            </div>
          ) : null}
          <h1 className="font-display text-h2 text-tinta">{product.name}</h1>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="font-ui text-h3 font-bold text-tinta">{priceLabel}</p>
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
            <span className="shrink-0 border border-linha px-3 py-2 text-body-sm font-semibold text-tinta">
              Ver loja
            </span>
          </a>

          {/*
            A historia da peca e o conteudo que vende a peca, nao legenda: sai do
            cinza auxiliar e vai para a cor de texto principal, com medida de
            linha limitada para nao virar uma faixa larga demais de leitura.
          */}
          <h2 className="mt-8 font-display text-h3 text-tinta">História da peça</h2>
          <p className="mt-2 max-w-prose text-body text-tinta">{product.description}</p>

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
            <FavoriteButton
              active={favorited}
              onToggle={() => {
                void protectedFavorite.runProtectedAction();
              }}
              disabled={product.status === 'vendido'}
            />
            <Button
              variant="primary"
              fullWidth
              disabled={product.status === 'vendido'}
              onClick={() => {
                void protectedBuy.runProtectedAction();
              }}
            >
              Comprar Agora • {priceLabel}
            </Button>
          </div>
        </div>
      </div>

      <LoginInterceptor
        open={activeIntercept !== null}
        title="Entre para favoritar e comprar"
        description="Faça login ou crie uma conta para favoritar peças e continuar sua compra."
        onLogin={activeIntercept?.goToLogin ?? (() => {})}
        onRegister={activeIntercept?.goToRegister ?? (() => {})}
        onDismiss={activeIntercept?.dismissInterceptor ?? (() => {})}
      />
    </Container>
  );
}

export default ProductDetail;
