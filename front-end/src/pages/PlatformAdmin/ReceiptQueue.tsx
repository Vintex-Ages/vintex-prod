import { useState, type ReactNode } from 'react';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { ReceiptList } from '@/components/admin/ReceiptList';
import { ReceiptListSkeleton } from '@/components/admin/ReceiptListSkeleton';
import { FilterChip } from '@/components/catalog/FilterChip';
import { SearchBar } from '@/components/catalog/SearchBar';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { useReceiptQueue, type ReceiptFilter } from '@/hooks/useReceiptQueue';
import type { ReceiptReview } from '@/types/admin';

/**
 * Fila de comprovantes da administradora (FE-US032-1, rota `/admin/receipts`).
 * Protegida por `RequireRole role="admin"` em `AppRoutes` (RN-24). Fica fora do
 * `WithLayout` porque tem cabeçalho próprio (`AdminHeader`), como as demais
 * telas de cabeçalho próprio do app.
 *
 * Lista, filtra (Todos · Pendentes · Aprovados · Rejeitados) e busca por
 * comprador ou loja; o termo e o filtro vão ao service (`useReceiptQueue`).
 * "Ver comprovante" guarda o item escolhido e entrega o detalhe a
 * `renderDetail` — o detalhe (FE-US032-2, #324) entra por aí, sem sair da fila.
 *
 * Usage:
 *   <Route path={paths.adminReceipts} element={<RequireRole role="admin"><ReceiptQueue /></RequireRole>} />
 *   <ReceiptQueue renderDetail={(item, onClose) => <ReceiptDetail item={item} onClose={onClose} />} />
 */
type ReceiptQueueProps = {
  /** Detalhe do comprovante (FE-US032-2). Chamado enquanto houver um item aberto. */
  renderDetail?: (item: ReceiptReview, onClose: () => void) => ReactNode;
};

const FILTERS: { value: ReceiptFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendente', label: 'Pendentes' },
  { value: 'aprovado', label: 'Aprovados' },
  { value: 'rejeitado', label: 'Rejeitados' },
];

function ReceiptQueue({ renderDetail }: ReceiptQueueProps) {
  const { state, filter, setFilter, search, retry } = useReceiptQueue();
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<ReceiptReview | null>(null);

  return (
    <div className="min-h-screen bg-branco-quente tablet:bg-papel">
      <AdminHeader />
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 pb-12 pt-6 tablet:gap-10 tablet:px-10 tablet:pb-24 tablet:pt-14 web:px-20">
        <div className="flex flex-col gap-1.5 tablet:gap-2.5">
          <h1 className="font-display text-h2 tracking-tight text-tinta">
            Repasses de pagamentos Pix
          </h1>
          <p className="font-ui text-body-sm text-texto-auxiliar">
            Confira o comprovante
            <span className="hidden tablet:inline"> enviado pelo comprador</span>, valide o
            pagamento e registre o repasse líquido ao vendedor, descontando a taxa Vintex de 9%.
          </p>
        </div>

        <div className="flex flex-col gap-6 tablet:flex-row tablet:items-center tablet:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
            {FILTERS.map(({ value, label }) => (
              <FilterChip
                key={value}
                label={label}
                compact
                active={filter === value}
                onToggle={() => setFilter(value)}
              />
            ))}
          </div>

          <div className="tablet:w-[360px]">
            <SearchBar
              value={draft}
              onChange={setDraft}
              onSubmit={search}
              placeholder="Buscar por comprador ou loja"
              submitVariant="arrow"
              loading={state.status === 'loading'}
            />
          </div>
        </div>

        {state.status === 'loading' && <ReceiptListSkeleton />}

        {state.status === 'error' && (
          <ErrorState message="Não foi possível carregar os comprovantes." onRetry={retry} />
        )}

        {state.status === 'forbidden' && (
          <ErrorState
            title="Sem permissão"
            message="Você não tem permissão para ver os comprovantes."
          />
        )}

        {state.status === 'ready' &&
          (state.items.length === 0 ? (
            <EmptyState
              title={
                filter === 'pendente'
                  ? 'Nenhum comprovante pendente'
                  : 'Nenhum comprovante encontrado'
              }
              message="Quando houver comprovantes, eles aparecem aqui."
            />
          ) : (
            <ReceiptList items={state.items} onViewReceipt={setSelected} />
          ))}

        {selected && renderDetail?.(selected, () => setSelected(null))}
      </main>
    </div>
  );
}

export default ReceiptQueue;
