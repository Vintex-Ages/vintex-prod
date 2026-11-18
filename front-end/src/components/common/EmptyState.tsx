import type { ReactNode } from 'react';

type EmptyStateProps = {
  title?: string;
  message: string;
  /**
   * Saída da tela vazia — um botão ou link. Opcional: nem toda ausência tem
   * uma ação óbvia, e um botão que não leva a lugar nenhum é pior que nenhum.
   */
  action?: ReactNode;
};

/**
 * Estado de ausência de conteúdo. Só apresentação: quem chama escreve a
 * mensagem e decide se existe uma saída (`action`) — ver `.ai/coding-rules.md`.
 *
 * O título usa `h4` e não `body` em negrito: era o mesmo tamanho do corpo, e
 * com os dois parágrafos centralizados no mesmo peso a caixa não tinha começo.
 *
 * Usage:
 *   import { EmptyState } from '@/components/common/EmptyState';
 *   <EmptyState message="Nenhuma peça por aqui ainda." />
 *   <EmptyState
 *     title="Nada com esses filtros"
 *     message="Tire um filtro para ver mais peças."
 *     action={<Button variant="secondary" onClick={limpar}>Limpar filtros</Button>}
 *   />
 */
export function EmptyState({
  title = 'Nenhuma peça encontrada',
  message,
  action,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex w-full flex-col items-center justify-center gap-3 border border-linha bg-branco-quente px-6 py-12 text-center"
    >
      <p className="font-display text-h4 font-semibold text-tinta">{title}</p>

      <p className="max-w-md font-ui text-body text-texto-auxiliar">{message}</p>

      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
