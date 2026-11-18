import clsx from 'clsx';
import IconButton from '@/components/common/IconButton';

export type CartBadgeProps = {
  count: number;
  onClick: () => void;
  ariaLabel?: string;
};

function BagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8h12l1 12H5L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

/**
 * Botão de carrinho para o header — reaproveita o `IconButton` e sobrepõe
 * uma bolha com a contagem de itens. Apresentação e comportamento genérico
 * (clique): sem regra de negócio, quem chama decide o que `onClick` faz.
 * A bolha só é exibida quando `count > 0`; acima de 99 mostra "99+".
 *
 * Usage:
 *   import CartBadge from '@/components/layout/CartBadge';
 *   <CartBadge count={carrinho.itens.length} onClick={abrirCarrinho} />
 */
function CartBadge({ count, onClick, ariaLabel }: CartBadgeProps) {
  const label = ariaLabel ?? `Carrinho, ${count} itens`;

  return (
    <span className="relative inline-flex">
      <IconButton icon={<BagIcon />} onClick={onClick} ariaLabel={label} />

      {count > 0 && (
        <span
          aria-hidden="true"
          className={clsx(
            'pointer-events-none absolute right-1 top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-vermelho-escuro px-1 text-label font-bold text-papel',
          )}
        >
          {count <= 99 ? count : '99+'}
        </span>
      )}
    </span>
  );
}

export default CartBadge;
