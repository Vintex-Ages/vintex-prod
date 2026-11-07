import { useId } from 'react';
import Button from '@/components/common/Button';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import StatusBadge from '@/components/product/StatusBadge';
import type { SellerProduct } from '@/types/product';

export type RowAction = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  disabledReason?: string;
};

export type SellerProductRowProps = {
  product: SellerProduct;
  actions: RowAction[];
  onOpen?: (id: string) => void;
};

const priceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Linha responsiva de uma peça do vendedor. Exibe somente os dados e ações
 * recebidos; a página consumidora continua responsável pelas regras de negócio.
 *
 * Usage:
 *   <SellerProductRow product={product} actions={[{ label: 'Editar', onSelect: edit }]} />
 */
function SellerProductRow({ product, actions, onOpen }: SellerProductRowProps) {
  const reasonIdPrefix = useId();

  return (
    <article className="flex w-full flex-col gap-4 border border-linha bg-branco-quente p-4 web:flex-row web:items-center">
      <div className="flex min-w-0 items-center gap-4 web:flex-1">
        <div className="h-20 w-20 shrink-0 overflow-hidden bg-papel-profundo">
          {product.coverImageUrl ? (
            <img
              src={product.coverImageUrl}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <ProductImagePlaceholder productName={product.name} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(product.id)}
              className="self-start text-left font-ui text-body font-semibold text-tinta transition-colors hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
            >
              {product.name}
            </button>
          ) : (
            <p className="font-ui text-body font-semibold text-tinta">{product.name}</p>
          )}

          <p className="font-ui text-body text-tinta">{priceFormatter.format(product.price)}</p>
        </div>
      </div>

      <div className="self-start web:self-auto">
        <StatusBadge status={product.status} />
      </div>

      {actions.length > 0 ? (
        <ul className="flex w-full flex-wrap gap-2 web:w-auto web:justify-end">
          {actions.map((action, index) => {
            const reasonId = `${reasonIdPrefix}-action-${index}`;
            const hasDisabledReason = action.disabled && action.disabledReason;

            return (
              <li
                key={`${action.label}-${index}`}
                className="flex min-w-0 flex-1 flex-col web:flex-none"
              >
                <Button
                  variant="quiet"
                  fullWidth
                  disabled={action.disabled}
                  aria-describedby={hasDisabledReason ? reasonId : undefined}
                  onClick={() => {
                    if (!action.disabled) action.onSelect();
                  }}
                >
                  {action.label}
                </Button>

                {hasDisabledReason ? (
                  <p id={reasonId} className="mt-1 text-body-sm text-texto-auxiliar">
                    {action.disabledReason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}

export default SellerProductRow;
