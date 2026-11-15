import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Avatar from '@/components/common/Avatar';
import Button from '@/components/common/Button';
import ErrorState from '@/components/common/ErrorState';
import { FavoriteButton } from '@/components/common/FavoriteButton';
import LoginInterceptor from '@/components/common/LoginInterceptor';
import VerifiedBadge from '@/components/common/VerifiedBadge';
import Container from '@/components/layout/Container';
import Gallery from '@/components/product/Gallery';
import SoldBadge from '@/components/product/SoldBadge';
import StatusBadge from '@/components/product/StatusBadge';
import { LookSuggestions } from '@/components/vintex-ai';
import { useAuth } from '@/context/useAuth';
import { useCart } from '@/context/useCart';
import { useFavorites } from '@/context/useFavorites';
import { useToast } from '@/context/useToast';
import {
  PENDING_ACTION_STORAGE_KEY,
  useProtectedAction,
  type PendingProtectedAction,
} from '@/hooks/useProtectedAction';
import type { CheckoutState } from '@/pages/Checkout/Checkout';
import { paths, storeProfile } from '@/routes/paths';
import { CatalogError, getProduct } from '@/services/catalogService';
import { getCombinations } from '@/services/combinationService';
import type { LookSuggestion } from '@/types/look';
import type { ProductDetail as ProductDetailData } from '@/types/product';

type Status = 'loading' | 'not_found' | 'error' | 'ready';

const LOOK_PIECE_INTENT = 'add-look-piece';

/**
 * Peça do look que ficou pendente quando alguém deslogado clicou em
 * "+ Adicionar" nesta peça de origem. Lê a intenção que o `useProtectedAction`
 * guardou; sem ela, depois do login a página remontada não saberia qual peça
 * foi clicada e a intenção nunca coincidiria.
 */
function pendingLookPiece(productId: string | undefined): string | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_ACTION_STORAGE_KEY);
    if (!raw || !productId) return null;
    const { intent } = JSON.parse(raw) as PendingProtectedAction;
    const pieceId = intent.payload?.pieceId;
    return intent.type.startsWith(LOOK_PIECE_INTENT) &&
      intent.payload?.productId === productId &&
      typeof pieceId === 'string'
      ? pieceId
      : null;
  } catch {
    return null;
  }
}

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
 * componente `Gallery` (FE-US012-2, #85). "Combine e monte o look" (FE-US030-1,
 * #412) é a `LookSuggestions` com as peças de `getCombinations`, carregadas
 * depois da peça principal; em erro ou sem peças, a seção não aparece.
 * "+ Adicionar" de uma peça sugerida a põe na sacola com o mesmo toast do
 * carrinho e a mesma barreira de login (com retomada da peça clicada). Sem
 * checkout real (pagamento real fora do escopo do projeto): o botão "Comprar
 * Agora" não dispara compra nenhuma, só a barreira de login (FE-US012-5, #88)
 * importa por enquanto. A adição ao carrinho usa o CartProvider compartilhado
 * (FE-US021-1, #225), que também atualiza reativamente o contador do Header.
 *
 * Barreira de login (FE-US012-5, #88): favoritar e comprar passam por
 * `useProtectedAction` — deslogado abre `LoginInterceptor` (compartilhado
 * entre os dois fluxos), logado executa a ação direto. O coração lê e escreve
 * no `useFavorites` (FE-US013-1, #328): favoritar aqui aparece no card da
 * grade, persiste no service e, depois do login, a intenção guardada marca a
 * peça de verdade. "Comprar Agora" abre o checkout com a peça (FE-US022-1,
 * #319); deslogado, volta a ele depois do login.
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
  const { ids: favoriteIds, setFavorite } = useFavorites();
  const { toast } = useToast();

  const [product, setProduct] = useState<ProductDetailData | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [look, setLook] = useState<LookSuggestion | null>(null);
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

  /**
   * "Combine e monte o look" (#412): só depois que a peça principal carregou,
   * num efeito próprio. Falha ou demora não derruba o detalhe: a seção
   * simplesmente não aparece. Resposta de outra peça (ou depois de desmontar)
   * é descartada. Reservada ou vendida também carrega (o back responde 200).
   */
  const loadedProductId = status === 'ready' ? product?.id : undefined;
  useEffect(() => {
    setLook(null);
    if (!loadedProductId) return undefined;

    let active = true;
    getCombinations(loadedProductId)
      .then((suggestion) => {
        if (active) setLook(suggestion);
      })
      .catch(() => {
        // Silencioso de propósito: sem combinação, a página segue sem a seção.
      });

    return () => {
      active = false;
    };
  }, [loadedProductId]);

  const productId = product?.id ?? '';
  const purchaseUnavailable = product?.status === 'reservado' || product?.status === 'vendido';
  const isFavorite = productId !== '' && favoriteIds.has(productId);

  /**
   * `intent`/`action` precisam manter identidade estável entre renders: o
   * `useEffect` de retomada do `useProtectedAction` roda de novo sempre que
   * essas referências mudam, e um objeto/função inline recriada a cada
   * render reexecutaria a ação já concluída (desfazendo o toggle).
   */
  const favoriteIntent = useMemo(() => ({ type: 'favorite', payload: { productId } }), [productId]);
  /**
   * Favoritar de verdade (FE-US013-1, #328): o estado vem do `useFavorites` e
   * a escrita passa pelo `favoriteService`. O contexto é otimista e desfaz o
   * coração quando a API falha — inclusive no `404` de peça que deixou de
   * existir. O erro morre aqui de propósito: nada de erro genérico na tela.
   *
   * O sentido é decidido no clique (`favoriteTargetRef`), não no momento em que
   * a ação roda: retomada depois do login, ela roda numa página remontada, com
   * `ids` ainda carregando — um `toggle` ali podia desfavoritar uma peça que já
   * era favorita. Sem clique nesta montagem, é retomada de quem clicou deslogado
   * no coração vazio, então é favoritar.
   */
  const favoriteTargetRef = useRef<boolean | null>(null);
  const toggleFavorite = useCallback(async () => {
    if (!productId) return;
    const target = favoriteTargetRef.current ?? true;
    favoriteTargetRef.current = null;

    try {
      await setFavorite(productId, target);
    } catch {
      // Silencioso de propósito: o `FavoritesContext` desfez o coração.
    }
  }, [productId, setFavorite]);

  const buyIntent = useMemo(() => ({ type: 'buy', payload: { productId } }), [productId]);
  /**
   * Abre o checkout só com esta peça, sem passar pelo carrinho (FE-US022-1,
   * #319). Deslogado, a barreira guarda a intenção e isto roda na volta do login.
   */
  const buyNow = useCallback(() => {
    if (!product || purchaseUnavailable) return;
    const { id, name, price, coverImageUrl, store } = product;
    navigate(paths.checkout, {
      state: { products: [{ id, name, price, coverImageUrl, store }] } satisfies CheckoutState,
    });
  }, [navigate, product, purchaseUnavailable]);

  /** Mesma regra para a peça principal e para as peças do look (#412). */
  const isInCart = useCallback(
    (pieceId: string) =>
      cart?.groups.some((group) => group.items.some((item) => item.product.id === pieceId)) ??
      false,
    [cart],
  );
  const alreadyInCart = isInCart(productId);

  /** Põe a peça na sacola com o toast de sucesso/erro do botão do carrinho. */
  const addPieceWithToast = useCallback(
    async (pieceId: string) => {
      try {
        await add(pieceId);
        toast('Adicionada ao carrinho', {
          kind: 'success',
          action: {
            label: 'Ver carrinho',
            onSelect: () => navigate(paths.cart),
          },
        });
      } catch {
        toast('Não foi possível adicionar ao carrinho. Tente novamente.', { kind: 'error' });
      }
    },
    [add, navigate, toast],
  );

  const addToCart = useCallback(async () => {
    if (!productId || purchaseUnavailable || alreadyInCart || isAddingRef.current) return;

    isAddingRef.current = true;
    setIsAdding(true);

    try {
      await addPieceWithToast(productId);
    } finally {
      isAddingRef.current = false;
      setIsAdding(false);
    }
  }, [addPieceWithToast, alreadyInCart, productId, purchaseUnavailable]);

  /**
   * "+ Adicionar" de uma peça do look (#412). A peça clicada entra na intenção
   * (`pieceId`), não numa ref: deslogado, a página remonta depois do login e
   * só a intenção guardada diz qual peça foi; `pendingLookPiece` a relê para a
   * intenção coincidir e o `useProtectedAction` retomar. Já na sacola, não
   * adiciona de novo; `lookAddingRef` impede a segunda execução enquanto a
   * primeira não termina (a retomada pode rodar de novo a cada render).
   */
  const [lookPieceId, setLookPieceId] = useState<string | null>(() => pendingLookPiece(id));
  const lookAddingRef = useRef(false);
  const addLookPiece = useCallback(async () => {
    if (!lookPieceId || isInCart(lookPieceId) || lookAddingRef.current) return;

    lookAddingRef.current = true;
    try {
      await addPieceWithToast(lookPieceId);
    } finally {
      lookAddingRef.current = false;
    }
  }, [addPieceWithToast, isInCart, lookPieceId]);

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

  // Mesma espera do carrinho: na volta do login, só coincide com o carrinho carregado.
  const lookPieceIntent = useMemo(
    () => ({
      type: cartReadyForResume ? LOOK_PIECE_INTENT : `${LOOK_PIECE_INTENT}-awaiting-cart`,
      payload: { productId, pieceId: lookPieceId },
    }),
    [cartReadyForResume, lookPieceId, productId],
  );

  const protectedFavorite = useProtectedAction({ intent: favoriteIntent, action: toggleFavorite });
  const protectedAddToCart = useProtectedAction({ intent: cartIntent, action: addToCart });
  const protectedBuy = useProtectedAction({ intent: buyIntent, action: buyNow });
  const protectedLookPiece = useProtectedAction({
    intent: lookPieceIntent,
    action: addLookPiece,
  });

  /**
   * O clique só escolhe a peça; a ação protegida roda no render seguinte, quando
   * a `intent` do hook já tem o `pieceId` (é ela que fica guardada para depois
   * do login). Cada clique é um pedido, atendido uma vez só.
   */
  const [lookRequest, setLookRequest] = useState(0);
  const handledLookRequest = useRef(0);
  const { runProtectedAction: runLookPiece } = protectedLookPiece;
  useEffect(() => {
    if (lookRequest === handledLookRequest.current) return;
    handledLookRequest.current = lookRequest;
    void runLookPiece();
  }, [lookRequest, runLookPiece]);

  const handleAddLookPiece = useCallback(
    (pieceId: string) => {
      if (isInCart(pieceId)) return;
      setLookPieceId(pieceId);
      setLookRequest((current) => current + 1);
    },
    [isInCart],
  );

  const activeIntercept = protectedFavorite.interceptorOpen
    ? protectedFavorite
    : protectedAddToCart.interceptorOpen
      ? protectedAddToCart
      : protectedBuy.interceptorOpen
        ? protectedBuy
        : protectedLookPiece.interceptorOpen
          ? protectedLookPiece
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
  const cartActionDisabled = purchaseUnavailable || cartLoading || alreadyInCart || isAdding;

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
            ) : product.status === 'reservado' ? (
              <div className="mb-2" role="status">
                <StatusBadge status="reservado" />
                <p className="mt-2 text-body-sm text-texto-auxiliar">Esta peça está reservada.</p>
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

          {/* Sem peças (ou enquanto carrega, ou em erro), nada aparece. */}
          {look ? <LookSuggestions suggestion={look} onAdd={handleAddLookPiece} /> : null}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 flex min-h-16 items-center gap-2 border-t border-linha bg-papel/95 px-4 py-2 backdrop-blur-sm web:static web:mt-8 web:gap-3 web:border-0 web:bg-transparent web:p-0">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-linha">
          <FavoriteButton
            active={isFavorite}
            onToggle={() => {
              favoriteTargetRef.current = !isFavorite;
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
          disabled={purchaseUnavailable}
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
