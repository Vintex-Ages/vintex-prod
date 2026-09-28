// src/components/cart/CartItemRow.tsx
import clsx from 'clsx';
import IconButton from '@/components/common/IconButton';
import type { Product } from '@/types/product';

export type CartItem = Product & { unavailable?: boolean };

export type CartItemRowProps = {
  item: CartItem;
  onRemove: (productId: string) => void;
  onOpen?: (productId: string) => void;
};

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

/**
 * Linha de item do carrinho — apresentação apenas. A página decide o que
 * `onRemove`/`onOpen` fazem e se o item está indisponível (`item.unavailable`).
 * Uma peça por item (RN-46): sem campo de quantidade.
 *
 * Usage:
 *   <CartItemRow item={item} onRemove={removerDoCarrinho} onOpen={abrirProduto} />
 */
function CartItemRow({ item, onRemove, onOpen }: CartItemRowProps) {
  const { id, name, price, coverImageUrl, store, unavailable = false } = item;

  return (
    <article className="flex items-center gap-3 border border-linha bg-branco-quente p-3">
      <div className={clsx('flex flex-1 items-center gap-3', unavailable && 'opacity-60')}>
        {coverImageUrl ? (
          <img src={coverImageUrl} alt="" className="h-16 w-16 shrink-0 object-cover" />
        ) : (
          <div className="h-16 w-16 shrink-0 bg-papel-profundo" aria-hidden="true" />
        )}

        <div className="flex flex-col gap-1">
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(id)}
              className="text-left font-ui text-body font-bold text-tinta hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
            >
              {name}
            </button>
          ) : (
            <p className="font-ui text-body font-bold text-tinta">{name}</p>
          )}

          <p className="font-ui text-body text-texto-auxiliar">{store.name}</p>

          <div className="flex items-center gap-2">
            <p className={clsx('font-ui text-body text-tinta', unavailable && 'line-through')}>
              {price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            {unavailable && (
              <span className="bg-tinta px-2 py-1 font-ui text-label text-branco-quente">
                Vendido
              </span>
            )}
          </div>
        </div>
      </div>

      <IconButton
        icon={<TrashIcon />}
        ariaLabel={`Remover ${name} do carrinho`}
        onClick={() => onRemove(id)}
      />
    </article>
  );
}

export default CartItemRow;
