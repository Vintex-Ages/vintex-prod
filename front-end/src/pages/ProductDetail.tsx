import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import suggestedBag from '@/assets/product-detail/suggested-bag.png';
import Avatar from '@/components/common/Avatar';
import Button from '@/components/common/Button';
import ErrorState from '@/components/common/ErrorState';
import { FavoriteButton } from '@/components/common/FavoriteButton';
import LoginInterceptor from '@/components/common/LoginInterceptor';
import VerifiedBadge from '@/components/common/VerifiedBadge';
import Container from '@/components/layout/Container';
import Gallery from '@/components/product/Gallery';
import SoldBadge from '@/components/product/SoldBadge';
import { useAuth } from '@/context/useAuth';
import { useCart } from '@/context/useCart';
import { useToast } from '@/context/useToast';
import { useProtectedAction } from '@/hooks/useProtectedAction';
import { paths, storeProfile } from '@/routes/paths';
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

function Attribute({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_1.85fr] items-start gap-3 border-b border-linha py-2.5">
      <dt className="text-body-sm font-medium text-texto-auxiliar">{label}</dt>
      <dd className="break-words text-body-sm font-semibold text-tinta">{value}</dd>
    </div>
  );
}

function CartIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8h16l-1 12H5L4 8Z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </svg>
  );
}

/**
 * Página de detalhe do produto (FE-US012-1). Busca via `catalogService.getProduct(id)`
 * e exibe a ficha completa — categoria, tamanho, cor, marca, conservação, cidade,
 * preço em destaque e descrição — mais o card da loja.
 *
 * Galeria de fotos (carrossel + miniaturas, ordenada por `position`) é o
 * componente `Gallery` (FE-US012-2, #85). A curadoria reproduz o card do frame
 * com estado local, pois a API atual não fornece um produto recomendado. Sem
 * checkout real (pagamento real fora do escopo do projeto): o botão "Comprar
 * Agora" não dispara compra nenhuma, só a barreira de login (FE-US012-5, #88)
 * importa por enquanto. A adição ao carrinho usa o CartProvider compartilhado
 * (FE-US021-1, #225), que também atualiza reativamente o contador do Header.
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
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { cart, loading: cartLoading, error: cartError, add } = useCart();
  const { toast } = useToast();

  const [product, setProduct] = useState<ProductDetailData | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [favorited, setFavorited] = useState(false);
  const [lookItemAdded, setLookItemAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const isAddingRef = useRef(false);

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

  const alreadyInCart = useMemo(
    () =>
      cart?.groups.some((group) => group.items.some((item) => item.product.id === productId)) ??
      false,
    [cart, productId],
  );

  const addToCart = useCallback(async () => {
    if (!productId || alreadyInCart || isAddingRef.current) return;

    isAddingRef.current = true;
    setIsAdding(true);

    try {
      await add(productId);
      toast('Adicionada ao carrinho', {
        kind: 'success',
        action: {
          label: 'Ver carrinho',
          onSelect: () => navigate(paths.cart),
        },
      });
    } catch {
      toast('Não foi possível adicionar ao carrinho. Tente novamente.', { kind: 'error' });
    } finally {
      isAddingRef.current = false;
      setIsAdding(false);
    }
  }, [add, alreadyInCart, navigate, productId, toast]);

  /**
   * Ao voltar do login, espera a primeira carga do carrinho antes de fazer a
   * intenção armazenada coincidir; assim refresh() não sobrescreve o add().
   */
  const cartReadyForResume =
    !isAuthenticated || (!cartLoading && (cart !== null || cartError !== null));
  const cartIntent = useMemo(
    () => ({
      type: cartReadyForResume ? 'add-to-cart' : 'add-to-cart-awaiting-cart',
      payload: { productId },
    }),
    [cartReadyForResume, productId],
  );

  const protectedFavorite = useProtectedAction({ intent: favoriteIntent, action: toggleFavorite });
  const protectedAddToCart = useProtectedAction({ intent: cartIntent, action: addToCart });
  const protectedBuy = useProtectedAction({ intent: buyIntent, action: noopBuy });

  const activeIntercept = protectedFavorite.interceptorOpen
    ? protectedFavorite
    : protectedAddToCart.interceptorOpen
      ? protectedAddToCart
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
  const cartButtonLabel = isAdding
    ? 'Adicionando ao carrinho'
    : alreadyInCart
      ? 'No carrinho'
      : 'Adicionar ao carrinho';
  const cartActionDisabled =
    product.status === 'vendido' || cartLoading || alreadyInCart || isAdding;

  return (
    <Container as="main" className="bg-branco-quente py-4 web:py-10">
      <nav
        aria-label="Trilha"
        className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-texto-auxiliar"
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
        <Link
          to={storeProfile(product.store.id)}
          className="hover:text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
        >
          {product.store.name}
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="text-tinta">
          {product.name}
        </span>
      </nav>

      <div className="grid grid-cols-1 gap-6 web:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] web:gap-8">
        <Gallery media={product.media} productName={product.name} />

        <div className="flex flex-col gap-6 pb-28 web:pb-0">
          <div>
            {product.status === 'vendido' ? (
              <div className="mb-2">
                <SoldBadge />
              </div>
            ) : null}
            <p className="mb-2 font-ui text-label font-bold uppercase leading-relaxed tracking-wider text-vermelho-escuro">
              {product.category} · {product.color} · {product.condition}
            </p>
            <h1 className="font-display text-[2.6rem] leading-[1.05] tracking-[-0.02em] text-tinta">
              {product.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3 border-b border-linha pb-4">
              <p className="font-ui text-[2rem] font-bold leading-[1.5] text-tinta">{priceLabel}</p>
              <p className="text-body-sm text-texto-auxiliar">
                Tamanho: <span className="font-bold text-tinta">{sizeLabel(product.size)}</span>
              </p>
            </div>
          </div>

          <Link
            to={storeProfile(product.store.id)}
            className="flex flex-col gap-3 border border-linha bg-branco-quente p-4 no-underline transition-colors hover:bg-papel-profundo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            <div className="flex items-center gap-3">
              <Avatar name={product.store.name} src={product.store.logoUrl} size="lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-display text-h4 text-tinta">{product.store.name}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <VerifiedBadge
                    state={product.store.verified ? 'confiavel' : 'pendente'}
                    label="Confiável"
                  />
                  {product.store.city ? (
                    <span className="text-label text-texto-auxiliar">{product.store.city}</span>
                  ) : null}
                </div>
              </div>
            </div>
            <span className="flex min-h-11 items-center justify-center border border-linha px-3 text-label font-semibold uppercase tracking-wide text-tinta">
              Ver loja
            </span>
          </Link>

          <section aria-labelledby="product-story-title">
            <h2
              id="product-story-title"
              className="border-b border-linha pb-2 font-display text-h4 text-tinta"
            >
              História da peça
            </h2>
            <p className="mt-2 max-w-prose text-body-sm text-texto-auxiliar">
              {product.description}
            </p>

            <dl className="mt-4 border-t border-linha">
              <Attribute label="Marca / Origem" value={product.brand} />
              <Attribute label="Estado" value={product.condition} />
              <Attribute label="Material" value={product.material ?? '—'} />
              <Attribute label="Medidas" value={product.measurements ?? '—'} />
              <Attribute label="Localização" value={product.store.city ?? '—'} />
            </dl>
          </section>

          <section className="border border-linha bg-papel-profundo p-5">
            <p className="font-ui text-label font-bold uppercase tracking-wider text-vermelho-escuro">
              <span aria-hidden="true">✨ </span>Curadoria da IA Vintex
            </p>
            <h2 className="mt-1 font-display text-h4 text-tinta">
              Combine esta peça e monte o look
            </h2>
            <p className="mt-1 text-body-sm text-texto-auxiliar">
              Sugestão harmônica baseada em estilo e textura:
            </p>
            <div className="mt-3 border border-linha bg-branco-quente p-4">
              <div className="flex items-center gap-3.5">
                <img
                  src={suggestedBag}
                  alt="Bolsa Baú de Couro Caramelo"
                  className="h-[93px] w-[143px] shrink-0 border border-linha object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
                  <div>
                    <h3 className="font-ui text-body-sm font-semibold leading-tight text-tinta">
                      Bolsa Baú de Couro Caramelo
                    </h3>
                    <p className="mt-1 text-label text-texto-auxiliar">Brechó da Redenção</p>
                  </div>
                  <p className="font-ui text-body-sm font-bold text-tinta">R$ 90</p>
                </div>
              </div>
              {/* ponytail: this Figma sample has no catalog ID; replace local look state when AI returns sellable product IDs. */}
              <button
                type="button"
                aria-pressed={lookItemAdded}
                onClick={() => setLookItemAdded((value) => !value)}
                className="mt-3 flex min-h-11 w-full items-center justify-center border border-tinta bg-tinta px-3 text-label font-semibold uppercase tracking-wide text-branco-quente transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
              >
                {lookItemAdded ? '✓ Adicionada ao look' : '+ Adicionar'}
              </button>
            </div>
          </section>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 flex min-h-16 items-center gap-2 border-t border-linha bg-papel/95 px-4 py-2 backdrop-blur-sm web:static web:mt-8 web:gap-3 web:border-0 web:bg-transparent web:p-0">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-linha">
          <FavoriteButton
            active={favorited}
            onToggle={() => {
              void protectedFavorite.runProtectedAction();
            }}
            disabled={product.status === 'vendido'}
          />
        </div>
        <button
          type="button"
          aria-label={cartButtonLabel}
          aria-busy={isAdding}
          disabled={cartActionDisabled}
          onClick={() => {
            void protectedAddToCart.runProtectedAction();
          }}
          className="flex h-12 w-12 shrink-0 items-center justify-center border border-linha bg-branco-quente text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CartIcon />
        </button>
        <Button
          variant="primary"
          aria-label={`Comprar Agora • ${priceLabel}`}
          disabled={product.status === 'vendido'}
          className="h-12 min-w-0 flex-1 px-2 text-label uppercase tracking-wide web:px-6 web:text-body-sm"
          onClick={() => {
            void protectedBuy.runProtectedAction();
          }}
        >
          Comprar Agora • {priceLabel}
        </Button>
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
