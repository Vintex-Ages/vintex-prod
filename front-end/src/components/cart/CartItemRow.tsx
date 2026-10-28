// src/components/cart/CartItemRow.tsx
import clsx from 'clsx';
import Button from '@/components/common/Button';
import IconButton from '@/components/common/IconButton';
import type { UnavailableReason } from '@/types/cart';
import type { Product } from '@/types/product';

export type CartItem = Product & { unavailable?: UnavailableReason };

export type CartItemRowProps = {
  item: CartItem;
  onRemove: (productId: string) => void;
  onOpen?: (productId: string) => void;
  action?: {
    label: string;
    onClick: (productId: string) => void;
    disabled?: boolean;
  };
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
 *   <CartItemRow
 *     item={item}
 *     onRemove={removerDosFavoritos}
 *     action={{ label: 'Adicionar ao carrinho', onClick: (productId) => adicionar(productId) }}
 *   />
 */
function CartItemRow({ item, onRemove, onOpen, action }: CartItemRowProps) {
  const { id, name, price, coverImageUrl, store, unavailable } = item;

  if (action) {
    return (
      <article className="relative flex items-start gap-3 border border-linha bg-branco-quente p-3">
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt=""
            className={clsx('h-24 w-20 shrink-0 object-cover', unavailable && 'opacity-60')}
          />
        ) : (
          <div className="h-24 w-20 shrink-0 bg-papel-profundo" aria-hidden="true" />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className={clsx('min-w-0 break-words pr-11', unavailable && 'opacity-60')}>
            <span
              className={clsx(
                'mb-2 inline-block border px-2 py-1 font-ui text-label uppercase',
                !unavailable && 'border-verde-rs/30 bg-verde-rs/10 text-verde-rs',
                unavailable === 'vendido' &&
                  'border-vermelho-escuro/30 bg-vermelho-suave text-vermelho-escuro',
                unavailable === 'pausado' && 'border-dourado bg-dourado/10 text-texto-auxiliar',
              )}
            >
              {unavailable === 'vendido' ? 'Vendido' : unavailable ? 'Indisponível' : 'Disponível'}
            </span>
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(id)}
                className="block text-left font-ui text-body-sm font-bold text-tinta hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
              >
                {name}
              </button>
            ) : (
              <p className="font-ui text-body-sm font-bold text-tinta">{name}</p>
            )}
            <p className="font-ui text-body-sm text-texto-auxiliar">{store.name}</p>
          </div>

          <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
            <p
              className={clsx(
                'font-ui text-body font-bold text-tinta',
                unavailable && 'line-through opacity-60',
              )}
            >
              {price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
            <Button
              type="button"
              variant="primary"
              className="ml-auto min-w-0 max-w-full whitespace-normal !px-3 focus-visible:!ring-tinta"
              disabled={Boolean(action.disabled || unavailable)}
              onClick={() => action.onClick(id)}
            >
              <span className="min-w-0 break-words font-ui text-label font-bold uppercase">
                {action.label}
              </span>
            </Button>
          </div>
        </div>

        <IconButton
          icon={
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          }
          // Com `action` a linha também serve em Favoritos (#329): sem "do carrinho".
          ariaLabel={`Remover ${name}`}
          onClick={() => onRemove(id)}
          className="absolute right-0 top-0 border-none bg-transparent"
        />
      </article>
    );
  }

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
                {unavailable === 'vendido' ? 'Vendido' : 'Indisponível'}
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
