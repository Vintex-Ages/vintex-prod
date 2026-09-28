import clsx from 'clsx';
import type { ProductStatus } from '@/types/product';

export type StatusBadgeProps = {
  status: ProductStatus;
  size?: 'sm' | 'md';
  label?: string;
};

/** Tradução valor do back → rótulo de tela (tabela "Status: dado × rótulo" da #202). */
const defaultLabels: Record<ProductStatus, string> = {
  rascunho: 'Rascunho',
  ativo: 'Anunciada',
  vendido: 'Já vendida',
  despublicado: 'Pausada',
};

/**
 * Selo de status utilizado para identificar o estado de uma peça.
 *
 * É apenas apresentacional: quem decide quando e onde exibir o status
 * é o componente ou a tela que utiliza o StatusBadge.
 *
 * Usage:
 *   <StatusBadge status="ativo" />
 *   <StatusBadge status="vendido" size="md" />
 *   <StatusBadge status="despublicado" label="Anúncio pausado" />
 */
function StatusBadge({ status, size = 'md', label }: StatusBadgeProps) {
  return (
    <span
      role="status"
      className={clsx('inline-flex items-center justify-center rounded-full border font-semibold', {
        'px-2 py-0.5 text-label': size === 'sm',
        'px-3 py-1 text-label': size === 'md',
        'border-linha bg-papel-profundo text-texto-auxiliar': status === 'rascunho',
        'border-linha bg-branco-quente text-tinta': status === 'ativo',
        'border-verde-rs bg-verde-rs text-branco-quente': status === 'vendido',
        'border-dourado bg-branco-quente text-dourado': status === 'despublicado',
      })}
    >
      {label ?? defaultLabels[status]}
    </span>
  );
}

export default StatusBadge;
