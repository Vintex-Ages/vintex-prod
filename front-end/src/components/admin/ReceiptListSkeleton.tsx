/**
 * Esqueleto da fila de comprovantes enquanto `listReceipts` não volta
 * (FE-US032-1). Sem dados nem regra: só blocos pulsando.
 *
 * Usage:
 *   import { ReceiptListSkeleton } from '@/components/admin/ReceiptListSkeleton';
 *   {state.status === 'loading' && <ReceiptListSkeleton />}
 */
export function ReceiptListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Carregando comprovantes"
      aria-busy="true"
      className="flex w-full flex-col gap-3"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-16 w-full animate-pulse border border-linha bg-papel-profundo"
        />
      ))}
    </div>
  );
}
