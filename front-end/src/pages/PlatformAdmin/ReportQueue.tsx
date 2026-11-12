import { AdminHeader } from '@/components/admin/AdminHeader';
import { ReportList } from '@/components/admin/ReportList';
import { ReportListSkeleton } from '@/components/admin/ReportListSkeleton';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { useAdminReports } from '@/hooks/useAdminReports';

/**
 * Reclamações dos compradores na área da administradora (FE-US025-2, #427;
 * rota `/admin/reports`). Protegida por `RequireRole role="admin"` em
 * `AppRoutes`; fica fora do `WithLayout` porque tem cabeçalho próprio
 * (`AdminHeader`), como a fila de comprovantes.
 *
 * Só leitura (RN-78: a Reclamação não é pública, só a administradora a lê):
 * motivo, descrição, Pedido, comprador, loja e data, da mais recente para a
 * mais antiga, com "Carregar mais". Sem ações e sem link para o Pedido.
 *
 * Só apresentação: carga, paginação e estados vêm do `useAdminReports`.
 *
 * Usage:
 *   <Route path={paths.adminReports} element={<RequireRole role="admin"><ReportQueue /></RequireRole>} />
 */
function ReportQueue() {
  const { state, reports, hasMore, loadingMore, loadMoreError, loadMore, retry } =
    useAdminReports();

  return (
    <div className="min-h-screen bg-branco-quente tablet:bg-papel">
      <AdminHeader />
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 pb-12 pt-6 tablet:gap-10 tablet:px-10 tablet:pb-24 tablet:pt-14 web:px-20">
        <div className="flex flex-col gap-1.5 tablet:gap-2.5">
          <h1 className="font-display text-h2 tracking-tight text-tinta">Reclamações</h1>
          <p className="font-ui text-body-sm text-texto-auxiliar">
            Problemas que os compradores reportaram nos pedidos. Só a administração vê estas
            reclamações.
          </p>
        </div>

        {state.status === 'loading' && <ReportListSkeleton />}

        {state.status === 'error' && (
          <ErrorState message="Não foi possível carregar as reclamações." onRetry={retry} />
        )}

        {state.status === 'forbidden' && (
          <ErrorState
            title="Sem permissão"
            message="Você não tem permissão para ver as reclamações."
          />
        )}

        {state.status === 'ready' &&
          (reports.length === 0 ? (
            <EmptyState
              title="Nenhuma reclamação recebida"
              message="Quando um comprador reportar um problema num pedido, a reclamação aparece aqui."
            />
          ) : (
            <div className="flex flex-col gap-4">
              <ReportList items={reports} />

              {loadMoreError ? (
                <p role="alert" className="font-ui text-body-sm text-vermelho-escuro">
                  Não foi possível carregar mais reclamações. Tente de novo.
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
            </div>
          ))}
      </main>
    </div>
  );
}

export default ReportQueue;
