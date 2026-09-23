import clsx from 'clsx';
import type { ProductStatus } from '@/types/product';

export type StatusBadgeProps = {
  status: ProductStatus;
  size?: 'sm' | 'md';
  label?: string;
};

const defaultLabels: Record<ProductStatus, string> = {
  anunciada: 'Anunciada',
  vendida: 'Já vendida',
  pausada: 'Pausada',
};

/**
 * Selo de status utilizado para identificar o estado de uma peça.
 *
 * É apenas apresentacional: quem decide quando e onde exibir o status
 * é o componente ou a tela que utiliza o StatusBadge.
 *
 * Usage:
 *   <StatusBadge status="anunciada" />
 *   <StatusBadge status="vendida" size="md" />
 *   <StatusBadge status="pausada" label="Anúncio pausado" />
 */
function StatusBadge({ status, size = 'md', label }: StatusBadgeProps) {
  return (
    <span
      role="status"
      className={clsx('inline-flex items-center justify-center rounded-full border font-semibold', {
        'px-2 py-0.5 text-label': size === 'sm',
        'px-3 py-1 text-label': size === 'md',
        'border-linha bg-branco-quente text-tinta': status === 'anunciada',
        'border-verde-rs bg-verde-rs text-branco-quente': status === 'vendida',
        'border-dourado bg-branco-quente text-dourado': status === 'pausada',
      })}
    >
      {label ?? defaultLabels[status]}
    </span>
  );
}

export default StatusBadge;
