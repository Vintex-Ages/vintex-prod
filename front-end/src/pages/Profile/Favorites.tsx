import { useNavigate } from 'react-router-dom';
import CartItemRow from '@/components/cart/CartItemRow';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import { useCart } from '@/context/useCart';
import { useToast } from '@/context/useToast';
import { useFavoritesList } from '@/hooks/useFavoritesList';
import { paths, productDetail } from '@/routes/paths';

/**
 * Esqueleto da lista enquanto `listFavorites` não volta. Mesma estrutura da
 * linha com `action` do `CartItemRow` (miniatura, textos e botão), sem dados
 * nem regra: só blocos pulsando.
 *
 * O contêiner anuncia o carregamento uma vez; cada linha é `aria-hidden` para
 * o leitor de tela não ler blocos vazios, e `motion-reduce` desliga a animação
 * para quem pediu menos movimento.
 */
function FavoritesSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Carregando favoritos" aria-busy="true" className="w-full">
      <ul data-testid="favorites-skeleton" className="flex flex-col gap-3">
        {Array.from({ length: count }).map((_, index) => (
          <li
            key={index}
            aria-hidden="true"
            className="flex animate-pulse items-start gap-3 border border-linha bg-branco-quente p-3 motion-reduce:animate-none"
          >
            <span className="h-24 w-20 shrink-0 bg-papel-profundo" />
            <span className="flex flex-1 flex-col gap-3">
              <span className="flex flex-col gap-2">
                <span className="h-5 w-24 bg-papel-profundo" />
                <span className="h-4 w-40 max-w-full bg-papel-profundo" />
                <span className="h-4 w-28 bg-papel-profundo" />
              </span>
              <span className="flex items-end justify-between gap-2">
                <span className="h-5 w-20 bg-papel-profundo" />
                <span className="h-11 w-40 max-w-[60%] bg-papel-profundo" />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * `/profile/favorites` — "Meus favoritos" (FE-US013-2, #329; RN-43/RN-44), a
 * aba de favoritos do perfil do comprador. Rota protegida por `RequireAuth`
 * em `AppRoutes`: deslogado vai ao login e volta para cá. Entrada pelo menu da
 * conta do `Header`.
 *
 * Cada peça favoritada aparece numa linha do `CartItemRow` com a ação
 * "Adicionar ao carrinho" (`useCart().add`); a peça **continua** na lista,
 * porque nenhuma regra manda tirá-la de lá. Peça **Vendida**, **Reservada** ou
 * **Pausada** aparece como Indisponível, com a ação desabilitada e o preço
 * riscado — a peça é sinalizada, não escondida (RN-44). "Remover" tira dos
 * favoritos (`setFavorite(id, false)`) e a linha sai da lista.
 *
 * Fica de fora, de propósito: "Em outro carrinho" e "Alta procura" (nenhuma
 * regra, e o primeiro expõe o carrinho de outra pessoa), "Alertas" e "Ver
 * peças similares (IA)" na peça vendida — escopo da issue.
 *
 * Só apresentação: carga, paginação, estado de cada peça e remoção vêm do
 * `useFavoritesList`.
 *
 * Usage:
 *   <Route path={paths.favorites} element={<RequireAuth><Favorites /></RequireAuth>} />
 */
export default function Favorites() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { add } = useCart();
  const { state, entries, hasMore, loadingMore, loadMoreError, loadMore, retry, remove } =
    useFavoritesList();

  async function handleAddToCart(productId: string) {
    try {
      await add(productId);
      toast('Adicionada ao carrinho', {
        kind: 'success',
        action: { label: 'Ver carrinho', onSelect: () => navigate(paths.cart) },
      });
    } catch {
      toast('Não foi possível adicionar ao carrinho. Tente novamente.', { kind: 'error' });
    }
  }

  async function handleRemove(productId: string) {
    try {
      await remove(productId);
      toast('Removida dos favoritos', { kind: 'success' });
    } catch {
      toast('Não foi possível remover dos favoritos. Tente novamente.', { kind: 'error' });
    }
  }

  function content() {
    if (state.status === 'loading') return <FavoritesSkeleton />;

    if (state.status === 'error') {
      return <ErrorState message="Não foi possível carregar seus favoritos." onRetry={retry} />;
    }

    if (entries.length === 0) {
      return (
        <EmptyState
          title="Você ainda não favoritou nenhuma peça"
          message="Garimpe o catálogo e toque no coração das peças que quiser guardar para depois."
          action={<Button onClick={() => navigate(paths.catalog)}>Explorar o catálogo</Button>}
        />
      );
    }

    return (
      <>
        {/* `h2` invisível: a lista é uma seção da página, e a página não pula de nível. */}
        <h2 id="lista-favoritos" className="sr-only">
          Peças favoritadas
        </h2>
        <ul aria-labelledby="lista-favoritos" className="flex flex-col gap-3">
          {entries.map(({ product, unavailable }) => (
            <li key={product.id}>
              <CartItemRow
                item={{ ...product, unavailable }}
                onRemove={(productId) => void handleRemove(productId)}
                onOpen={(productId) => navigate(productDetail(productId))}
                action={{
                  label: 'Adicionar ao carrinho',
                  onClick: (productId) => void handleAddToCart(productId),
                }}
              />
            </li>
          ))}
        </ul>

        {loadMoreError ? (
          <p role="alert" className="font-ui text-body-sm text-vermelho-escuro">
            Não foi possível carregar mais favoritos. Tente de novo.
          </p>
        ) : null}

        {hasMore ? (
          <Button
            variant="outline"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="self-center"
          >
            {loadingMore ? 'Carregando...' : 'Carregar mais'}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <Container as="main" className="flex flex-col gap-6 py-6 tablet:py-10">
      <h1 className="font-display text-h2 text-tinta">Meus favoritos</h1>
      {content()}
    </Container>
  );
}
