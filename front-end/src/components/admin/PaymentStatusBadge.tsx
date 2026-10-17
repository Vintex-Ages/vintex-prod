import clsx from 'clsx';
import type { PaymentStatus } from '@/types/order';

/**
 * Selo do status do pagamento (fila de comprovantes, FE-US032-1). Só
 * apresentação: recebe o status pronto do service.
 *
 * Usage:
 *   import { PaymentStatusBadge } from '@/components/admin/PaymentStatusBadge';
 *   <PaymentStatusBadge status="pendente" />
 */
const LABELS: Record<PaymentStatus, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
};

const TONES: Record<PaymentStatus, string> = {
  pendente: 'border-dourado bg-branco-quente text-tinta',
  aprovado: 'border-verde-rs bg-verde-rs text-branco-quente',
  rejeitado: 'border-vermelho-escuro bg-vermelho-suave text-vermelho-escuro',
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 font-ui text-label font-semibold',
        TONES[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}
