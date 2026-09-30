import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CartItemRow from '@/components/cart/CartItemRow';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import { useCart } from '@/context/useCart';
import { useToast } from '@/context/useToast';
import { paths, productDetail } from '@/routes/paths';
import type { CartGroup, CartItem } from '@/types/cart';
import { formatCentsToBRL } from '@/utils/format';

/** Peça que o carrinho tirou por ter sido vendida, mostrada até o fim da visita. */
type SoldNotice = { groupId: string; item: CartItem };

function toRowItem(item: CartItem) {
  return { ...item.product, unavailable: item.unavailable };
}

/**
 * `/cart` — carrinho do comprador (FE-US021-2, #226, RN-46). Rota protegida
 * por `RequireAuth` em `AppRoutes`: deslogado vai ao login e volta para cá.
 *
 * **Um carrinho por loja (RN-18, RN-19):** os itens aparecem agrupados por
 * brechó, cada grupo com o próprio subtotal. Não há total somando lojas,
 * porque o pagamento é Pix direto para a chave de cada vendedor.
 *
 * **O carrinho reflete disponibilidade:** ao abrir, recarrega do back. Peça
 * que chegou `unavailable` (vendida a outra pessoa) gera um aviso, sai do
 * carrinho e continua visível na linha marcada como vendida até sair da
 * tela; o subtotal já não conta com ela.
 *
 * "Finalizar compra" é placeholder desabilitado: o checkout é da S3.
 *
 * Usage:
 *   <Route path={paths.cart} element={<RequireAuth><Cart /></RequireAuth>} />
 */
function Cart() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { cart, loading, error, remove, refresh } = useCart();
  const [soldNotices, setSoldNotices] = useState<SoldNotice[]>([]);
  /** Ids já avisados, para o aviso não repetir quando o carrinho recarrega. */
  const noticedRef = useRef(new Set<string>());

  // Ao abrir a tela, busca de novo: disponibilidade muda sem o comprador fazer nada.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!cart) return;
    const sold: SoldNotice[] = cart.groups.flatMap((group) =>
      group.items
        .filter((item) => item.unavailable && !noticedRef.current.has(item.product.id))
        .map((item) => ({ groupId: group.store.id, item })),
    );
    if (sold.length === 0) return;

    for (const { item } of sold) {
      noticedRef.current.add(item.product.id);
      toast(`${item.product.name} foi vendida e saiu do seu carrinho`, { kind: 'info' });
      void remove(item.product.id).catch(() => {
        // Se a remoção falhar, a linha segue marcada como vendida e fora do subtotal.
      });
    }
    setSoldNotices((current) => [...current, ...sold]);
  }, [cart, remove, toast]);

  async function handleRemove(productId: string) {
    try {
      await remove(productId);
    } catch {
      toast('Não foi possível remover a peça agora.', { kind: 'error' });
    }
  }

  const openProduct = (productId: string) => navigate(productDetail(productId));

  const intro = <h1 className="font-display text-h2 text-tinta">Seu carrinho</h1>;

  if (!cart && (loading || !error)) {
    return (
      <Container as="main" className="flex flex-col gap-6 py-10">
        {intro}
        <p role="status" className="sr-only">
          Carregando seu carrinho…
        </p>
        <ul aria-hidden="true" data-testid="cart-skeleton" className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <li
              key={index}
              className="flex animate-pulse items-center gap-3 border border-linha bg-branco-quente p-3 motion-reduce:animate-none"
            >
              <span className="h-16 w-16 shrink-0 bg-papel-profundo" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-4 w-40 max-w-full bg-papel-profundo" />
                <span className="h-4 w-20 bg-papel-profundo" />
              </span>
            </li>
          ))}
        </ul>
      </Container>
    );
  }

  if (error && !cart) {
    return (
      <Container as="main" className="flex flex-col gap-6 py-10">
        {intro}
        <ErrorState
          message="Não foi possível carregar seu carrinho."
          onRetry={() => void refresh()}
        />
      </Container>
    );
  }

  const groups: CartGroup[] = cart?.groups ?? [];
  const soldIds = new Set(soldNotices.map((notice) => notice.item.product.id));
  // Grupos com o que ainda está à venda; os vendidos aparecem à parte, por loja.
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !soldIds.has(item.product.id)),
    }))
    .filter(
      (group) =>
        group.items.length > 0 || soldNotices.some((notice) => notice.groupId === group.store.id),
    );
  const orphanNotices = soldNotices.filter(
    (notice) => !visibleGroups.some((group) => group.store.id === notice.groupId),
  );

  if (visibleGroups.length === 0 && orphanNotices.length === 0) {
    return (
      <Container as="main" className="flex flex-col gap-6 py-10">
        {intro}
        <EmptyState
          title="Seu carrinho está vazio"
          message="Garimpe peças no catálogo e elas aparecem aqui, separadas por brechó."
          action={<Button onClick={() => navigate(paths.catalog)}>Explorar o catálogo</Button>}
        />
      </Container>
    );
  }

  function dismissNotice(productId: string) {
    setSoldNotices((current) => current.filter((notice) => notice.item.product.id !== productId));
  }

  function soldRows(groupId: string | null) {
    const notices =
      groupId === null ? orphanNotices : soldNotices.filter((notice) => notice.groupId === groupId);
    return notices.map(({ item }) => (
      <li key={`vendida-${item.product.id}`}>
        <CartItemRow item={{ ...toRowItem(item), unavailable: true }} onRemove={dismissNotice} />
      </li>
    ));
  }

  return (
    <Container as="main" className="flex flex-col gap-6 py-10">
      {intro}
      <p className="font-ui text-body-sm text-texto-auxiliar">
        Cada brechó recebe o pagamento direto, por Pix. Por isso o carrinho é separado por loja.
      </p>

      {visibleGroups.map((group) => {
        const headingId = `carrinho-loja-${group.store.id}`;
        return (
          <section
            key={group.store.id}
            aria-labelledby={headingId}
            className="flex flex-col gap-3 border-t border-linha pt-4"
          >
            <h2 id={headingId} className="font-display text-h4 text-tinta">
              {group.store.name}
            </h2>

            <ul className="flex flex-col gap-3">
              {group.items.map((item) => (
                <li key={item.product.id}>
                  <CartItemRow
                    item={toRowItem(item)}
                    onRemove={(id) => void handleRemove(id)}
                    onOpen={openProduct}
                  />
                </li>
              ))}
              {soldRows(group.store.id)}
            </ul>

            <div className="flex flex-col gap-3 tablet:flex-row tablet:items-center tablet:justify-between">
              <p className="font-ui text-body text-tinta">
                Subtotal da loja:{' '}
                <strong data-testid={`subtotal-${group.store.id}`}>
                  {formatCentsToBRL(group.subtotalCents)}
                </strong>
              </p>
              <div className="flex flex-col items-start gap-1 tablet:items-end">
                <Button disabled aria-describedby={`${headingId}-em-breve`}>
                  Finalizar compra
                </Button>
                <span
                  id={`${headingId}-em-breve`}
                  className="font-ui text-label text-texto-auxiliar"
                >
                  Em breve: pagamento por Pix direto ao brechó.
                </span>
              </div>
            </div>
          </section>
        );
      })}

      {orphanNotices.length > 0 && (
        <section aria-label="Peças que saíram do carrinho" className="flex flex-col gap-3">
          <ul className="flex flex-col gap-3">{soldRows(null)}</ul>
        </section>
      )}
    </Container>
  );
}

export default Cart;
