/**
 * Esqueleto da lista de Reclamações enquanto `listReports` não volta
 * (FE-US025-2, #427). Mesmo padrão do `ReceiptListSkeleton`, com blocos mais
 * altos porque o cartão tem a descrição. Sem dados nem regra.
 *
 * Usage:
 *   import { ReportListSkeleton } from '@/components/admin/ReportListSkeleton';
 *   {state.status === 'loading' && <ReportListSkeleton />}
 */
export function ReportListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Carregando reclamações"
      aria-busy="true"
      className="flex w-full flex-col gap-4"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-36 w-full animate-pulse border border-linha bg-papel-profundo"
        />
      ))}
    </div>
  );
}
