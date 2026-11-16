/**
 * Esqueleto do painel geral enquanto `getDashboard` não volta (FE-US033-1,
 * #413): os cinco cartões e o bloco de vendas por loja. Mesmo padrão do
 * `ReportListSkeleton`. Sem dados nem regra.
 *
 * Usage:
 *   {state.status === 'loading' && <AdminDashboardSkeleton />}
 */
export function AdminDashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Carregando o painel"
      aria-busy="true"
      className="flex w-full flex-col gap-6 tablet:gap-10"
    >
      <div className="grid gap-3 tablet:grid-cols-2 tablet:gap-6 web:grid-cols-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="h-32 w-full animate-pulse border border-linha bg-papel-profundo motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="h-64 w-full animate-pulse border border-linha bg-papel-profundo motion-reduce:animate-none" />
    </div>
  );
}
