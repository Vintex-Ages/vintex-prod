import { useNavigate } from 'react-router-dom';
import { FilterChip } from '@/components/catalog/FilterChip';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import SellerProductRow, { type RowAction } from '@/components/seller/SellerProductRow';
import StatCard from '@/components/seller/StatCard';
import { useToast } from '@/context/useToast';
import { useSellerProducts, type StatusFilter } from '@/hooks/useSellerProducts';
import { paths, sellerProductPath } from '@/routes/paths';
import { SellerProductError } from '@/services/sellerProductService';
import type { SellerProduct } from '@/types/product';

/** Rótulos da tela; os valores são os do back (ver `ProductStatus`). */
const CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'ativo', label: 'Anunciadas' },
  { value: 'vendido', label: 'Vendidas' },
  { value: 'despublicado', label: 'Pausadas' },
];

/**
 * `/seller` — painel do vendedor (FE-US019-1, #220): peças por status e
 * totais. Visão de saldo, não de estoque (RN-51): cada peça é única, então o
 * que importa é em que situação ela está, não quantas unidades existem.
 *
 * Ações por linha (FE-US019-2, #221), decididas pelo valor do status:
 * - `ativo` → Editar · Despublicar (pausa; sai da vitrine, fica no histórico — RN-52)
 * - `despublicado` → Editar · Republicar (`publish`)
 * - `vendido` → Editar desabilitado com o motivo (RN-53), sem despublicar
 *
 * Despublicar confirma com um Toast que oferece "Desfazer" (republica). A
 * linha muda sem recarregar a lista; erro do back vira Toast de erro.
 */
const SOLD_REASON = 'Peça vendida não pode ser editada';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof SellerProductError && error.code === 'PRODUCT_SOLD') {
    return 'Esta peça já foi vendida e não pode mais ser alterada.';
  }
  return fallback;
}

function SellerAdmin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { state, filter, setFilter, visible, retry, unpublishProduct, republishProduct } =
    useSellerProducts();

  const anunciar = () => navigate(paths.sellerProductNew);

  async function republicar(product: SellerProduct) {
    try {
      await republishProduct(product.id);
      toast('Anúncio publicado de novo', { kind: 'success' });
    } catch (error) {
      toast(errorMessage(error, 'Não foi possível republicar a peça agora.'), { kind: 'error' });
    }
  }

  async function despublicar(product: SellerProduct) {
    try {
      await unpublishProduct(product.id);
      toast('Anúncio pausado', {
        kind: 'success',
        action: { label: 'Desfazer', onSelect: () => void republicar(product) },
      });
    } catch (error) {
      toast(errorMessage(error, 'Não foi possível pausar o anúncio agora.'), { kind: 'error' });
    }
  }

  function acoes(product: SellerProduct): RowAction[] {
    const editar: RowAction = {
      label: 'Editar',
      onSelect: () => navigate(sellerProductPath(product.id)),
    };

    switch (product.status) {
      case 'ativo':
        return [editar, { label: 'Despublicar', onSelect: () => void despublicar(product) }];
      case 'despublicado':
        return [editar, { label: 'Republicar', onSelect: () => void republicar(product) }];
      case 'vendido':
        return [{ ...editar, disabled: true, disabledReason: SOLD_REASON }];
      default:
        return [];
    }
  }

  return (
    <Container as="main" className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-4 web:flex-row web:items-center web:justify-between">
        <h1 className="font-display text-h2 text-tinta">Painel do vendedor</h1>
        <Button onClick={anunciar}>Anunciar peça</Button>
      </div>

      {state.status === 'loading' && (
        <>
          <p role="status" className="sr-only">
            Carregando suas peças…
          </p>
          {/* Skeleton de linha (#220): mesmo contorno do SellerProductRow. */}
          <ul className="flex flex-col gap-3" aria-hidden="true" data-testid="seller-skeleton">
            {Array.from({ length: 3 }).map((_, index) => (
              <li
                key={index}
                className="flex animate-pulse items-center gap-4 border border-linha bg-branco-quente p-4 motion-reduce:animate-none"
              >
                <span className="h-20 w-20 shrink-0 bg-papel-profundo" />
                <span className="flex flex-1 flex-col gap-2">
                  <span className="h-4 w-48 max-w-full bg-papel-profundo" />
                  <span className="h-4 w-24 bg-papel-profundo" />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {state.status === 'error' && (
        <ErrorState message="Não foi possível carregar suas peças agora." onRetry={retry} />
      )}

      {state.status === 'ready' && (
        <>
          <section
            aria-label="Resumo das suas peças"
            className="grid grid-cols-1 gap-4 web:grid-cols-3"
          >
            <div data-testid="stat-anunciadas">
              <StatCard label="Anunciadas" value={String(state.counts.ativo)} />
            </div>
            <div data-testid="stat-vendidas">
              <StatCard label="Vendidas" value={String(state.counts.vendido)} />
            </div>
            <div data-testid="stat-pausadas">
              <StatCard label="Pausadas" value={String(state.counts.despublicado)} />
            </div>
          </section>

          <p className="font-ui text-body-sm text-texto-auxiliar">
            {state.counts.total === 1 ? '1 peça no total' : `${state.counts.total} peças no total`}
          </p>

          <div className="flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <FilterChip
                key={chip.value}
                label={chip.label}
                active={filter === chip.value}
                onToggle={() => setFilter(chip.value)}
              />
            ))}
          </div>

          {state.counts.total === 0 ? (
            <EmptyState
              title="Nenhuma peça por aqui"
              message="Anuncie sua primeira peça e ela aparece neste painel."
              action={<Button onClick={anunciar}>Anunciar peça</Button>}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="Nada com esse filtro"
              message="Escolha outro filtro para ver suas peças."
              action={
                <Button variant="secondary" onClick={() => setFilter('todas')}>
                  Ver todas
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {visible.map((product) => (
                <li key={product.id}>
                  <SellerProductRow
                    product={product}
                    actions={acoes(product)}
                    // Vendida não abre o formulário (RN-53): o nome fica só como texto.
                    onOpen={
                      product.status === 'vendido'
                        ? undefined
                        : (id) => navigate(sellerProductPath(id))
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Container>
  );
}

export default SellerAdmin;
