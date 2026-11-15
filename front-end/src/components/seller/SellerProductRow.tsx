import { useId } from 'react';
import clsx from 'clsx';
import Button from '@/components/common/Button';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import StatusBadge from '@/components/product/StatusBadge';
import type { SellerProduct } from '@/types/product';

export type RowAction = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  disabledReason?: string;
  /** `secondary` (com contorno) destaca a ação principal da linha; o padrão é `quiet`. */
  variant?: 'secondary' | 'quiet';
  /**
   * Texto mais largo que esta ação assume em outro momento (ex.: "Republicar" para "Pausar").
   * O botão reserva a largura dele, para não mudar de tamanho nem empurrar os vizinhos quando o
   * texto troca.
   */
  widthLabel?: string;
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
  // "Tamanho M • Marca • Preço: R$ 198,00" (frame ajustado do Figma, T15): só entra o que a peça tem.
  const attributes = [
    product.size ? `Tamanho ${product.size}` : null,
    product.brand ?? null,
  ].filter((attribute): attribute is string => Boolean(attribute));
  // Com uma ação principal (com contorno), todas ficam do tamanho do texto e agrupadas à direita,
  // como "Editar anúncio" e "Pausar" no frame. Sem ela (rascunhos), as ações dividem a linha.
  const hasPrimaryAction = actions.some((action) => action.variant === 'secondary');

  return (
    <article className="flex w-full flex-col gap-4 border border-linha bg-branco-quente p-4 web:flex-row web:items-center">
      <div className="flex min-w-0 items-center gap-4 web:flex-1">
        <div className="h-[75px] w-[65px] shrink-0 overflow-hidden border border-linha bg-papel-profundo">
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

          {/* No celular os atributos e o preço ficam cada um na sua linha (frame, T15); a partir de
              `tablet` seguem na mesma linha, separados por "•". */}
          <p className="font-ui text-body-sm text-texto-auxiliar">
            {attributes.length > 0 && (
              <>
                <span className="block tablet:inline">{attributes.join(' • ')}</span>
                <span className="hidden tablet:inline"> • </span>
              </>
            )}
            <span className="block whitespace-nowrap tablet:inline">
              Preço: <span className="font-bold">{priceFormatter.format(product.price)}</span>
            </span>
          </p>
        </div>
      </div>

      <div className="self-start web:self-auto">
        <StatusBadge status={product.status} />
      </div>

      {actions.length > 0 ? (
        <ul className="flex w-full flex-wrap justify-end gap-2 web:w-auto">
          {actions.map((action, index) => {
            const reasonId = `${reasonIdPrefix}-action-${index}`;
            const hasDisabledReason = action.disabled && action.disabledReason;

            return (
              <li
                key={`${action.label}-${index}`}
                className={clsx(
                  'flex min-w-0 flex-col web:flex-none',
                  hasPrimaryAction ? 'flex-none' : 'flex-1',
                )}
              >
                <Button
                  variant={action.variant ?? 'quiet'}
                  // Botão compacto do frame (T15): padding lateral de 12px, rótulo em caixa alta.
                  // A ação principal tem borda de 1px. A cor da borda no Figma (#9E8E7C) não é
                  // token: usa-se `border-linha` (da variante `secondary`), o token mais próximo.
                  className={clsx(
                    'px-[0.75rem] text-label uppercase web:min-h-9',
                    action.variant === 'secondary' && 'border-[1px]',
                  )}
                  fullWidth
                  disabled={action.disabled}
                  aria-describedby={hasDisabledReason ? reasonId : undefined}
                  onClick={() => {
                    if (!action.disabled) action.onSelect();
                  }}
                >
                  {action.widthLabel ? (
                    // O botão ocupa a largura do maior dos dois textos, então trocar "Pausar" por
                    // "Republicar" não move nem encolhe nada. O texto reservado fica invisível e
                    // escondido de leitores de tela.
                    <span className="inline-grid text-center">
                      <span className="col-start-1 row-start-1">{action.label}</span>
                      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
                        {action.widthLabel}
                      </span>
                    </span>
                  ) : (
                    action.label
                  )}
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
