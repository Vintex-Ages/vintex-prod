import { useId } from 'react';
import { AdminDashboardSkeleton } from '@/components/admin/AdminDashboardSkeleton';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { DashboardStatCard } from '@/components/admin/DashboardStatCard';
import { StoreSalesList } from '@/components/admin/StoreSalesList';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import { useAdminDashboard } from '@/hooks/useAdminDashboard';
import type { AdminDashboard as AdminDashboardData } from '@/types/dashboard';
import { formatCentsToBRL } from '@/utils/format';

/** Os valores do painel vêm em reais; o formatador do projeto recebe centavos. */
const brl = (reais: number) => formatCentsToBRL(Math.round(reais * 100));
const count = (value: number) => value.toLocaleString('pt-BR');

function Content({ dashboard }: { dashboard: AdminDashboardData }) {
  const salesTitleId = useId();

  return (
    <>
      <section aria-label="Números da plataforma">
        <dl className="grid gap-3 tablet:grid-cols-2 tablet:gap-6 web:grid-cols-3">
          <DashboardStatCard
            label="Valor total vendido no site"
            value={brl(dashboard.salesVolume)}
          />
          {/* "9%" é só texto do rótulo (como no Figma): o valor vem pronto do back. */}
          <DashboardStatCard
            label="Valor retido pela Vintex (9%)"
            value={brl(dashboard.commissionTotal)}
            tone="success"
          />
          <DashboardStatCard
            label="Peças ativas no site"
            value={count(dashboard.activeProductsCount)}
          />
          <DashboardStatCard label="Lojas na plataforma" value={count(dashboard.storesCount)} />
          <DashboardStatCard label="Usuários cadastrados" value={count(dashboard.usersCount)} />
        </dl>
      </section>

      <section
        aria-labelledby={salesTitleId}
        className="flex flex-col gap-4 border border-linha bg-branco-quente p-5 tablet:gap-5 tablet:bg-papel-profundo tablet:p-7"
      >
        <h2 id={salesTitleId} className="font-display text-h4 tracking-tight text-tinta">
          Vendas por loja
        </h2>
        {dashboard.salesByStore.length === 0 ? (
          <EmptyState
            title="Nenhuma venda ainda"
            message="Quando houver pedidos confirmados, o valor vendido por cada loja aparece aqui."
          />
        ) : (
          <StoreSalesList items={dashboard.salesByStore} />
        )}
      </section>
    </>
  );
}

/**
 * Painel geral da administradora (FE-US033-1, #413; rota `/admin/dashboard`).
 * Protegida por `RequireRole role="admin"` em `AppRoutes`; fica fora do
 * `WithLayout` porque tem cabeçalho próprio (`AdminHeader`), como as filas.
 *
 * Cartões no estilo do Figma "Financeiro e GMV" (web 520:782, mobile 543:858):
 * valor vendido, comissão retida, peças ativas, lojas e usuários, e a lista de
 * vendas por loja na ordem do back. Onde o Figma e o back divergem, vale o
 * back: sem os blocos de busca com IA, sem "últimos 30 dias" e com lojas e
 * usuários, que o Figma não tem.
 *
 * A tela não calcula nada: os números vêm prontos do `getDashboard`. Carga e
 * estados vêm do `useAdminDashboard`.
 *
 * Usage:
 *   <Route path={paths.adminDashboard} element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
 */
function AdminDashboard() {
  const { state, retry } = useAdminDashboard();

  return (
    <div className="min-h-screen bg-branco-quente tablet:bg-papel">
      <AdminHeader />
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 pb-12 pt-6 tablet:gap-10 tablet:px-10 tablet:pb-24 tablet:pt-14 web:px-20">
        <div className="flex flex-col gap-1.5 tablet:gap-2.5">
          <h1 className="font-display text-h2 tracking-tight text-tinta">Painel geral</h1>
          <p className="font-ui text-body-sm text-texto-auxiliar">
            Acompanhe os números da plataforma, o valor vendido no site e a comissão retida pela
            Vintex.
          </p>
        </div>

        {state.status === 'loading' && <AdminDashboardSkeleton />}

        {state.status === 'error' && (
          <ErrorState message="Não foi possível carregar o painel." onRetry={retry} />
        )}

        {state.status === 'ready' && <Content dashboard={state.dashboard} />}
      </main>
    </div>
  );
}

export default AdminDashboard;
