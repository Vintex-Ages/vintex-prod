import { useNavigate } from 'react-router-dom';
import { FilterChip } from '@/components/catalog/FilterChip';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import SellerProductRow from '@/components/seller/SellerProductRow';
import StatCard from '@/components/seller/StatCard';
import { useSellerProducts, type StatusFilter } from '@/hooks/useSellerProducts';

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
 * As ações de cada linha chegam na FE-US019-2 (#221); por ora as linhas só
 * listam e abrem a peça.
 */
function SellerAdmin() {
  const navigate = useNavigate();
  const { state, filter, setFilter, visible, retry } = useSellerProducts();

  const anunciar = () => navigate('/seller/products/new');

  return (
    <Container as="main" className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-4 web:flex-row web:items-center web:justify-between">
        <h1 className="font-display text-h2 text-tinta">Painel do vendedor</h1>
        <Button onClick={anunciar}>Anunciar peça</Button>
      </div>

      {state.status === 'loading' && (
        <p
          role="status"
          aria-label="Carregando"
          className="font-ui text-body-sm text-texto-auxiliar"
        >
          Carregando suas peças…
        </p>
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
                    actions={[]}
                    onOpen={(id) => navigate(`/seller/products/${id}`)}
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
