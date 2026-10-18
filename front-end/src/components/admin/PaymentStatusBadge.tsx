import clsx from 'clsx';
import type { PaymentStatus } from '@/types/order';

/**
 * Selo do status do pagamento (fila de comprovantes, FE-US032-1), com o
 * pontinho do Figma. Só apresentação: recebe o status pronto do service.
 *
 * Usage:
 *   import { PaymentStatusBadge } from '@/components/admin/PaymentStatusBadge';
 *   <PaymentStatusBadge status="pendente" />
 */
const LABELS: Record<PaymentStatus, string> = {
  pendente: 'Pendente de validação',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
};

const TONES: Record<PaymentStatus, string> = {
  pendente: 'border-dourado bg-branco-quente text-dourado',
  aprovado: 'border-verde-rs bg-verde-rs text-branco-quente',
  rejeitado: 'border-vermelho-escuro bg-vermelho-suave text-vermelho-escuro',
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 font-ui text-label font-semibold',
        TONES[status],
      )}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABELS[status]}
    </span>
  );
}
