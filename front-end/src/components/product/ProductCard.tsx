import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import type { Product, ProductDetail } from '@/types/product';

export type ProductCardProps = {
  /** Campos do feed, com categoria, tamanho e conservação opcionais. */
  product: Product & Partial<Pick<ProductDetail, 'category' | 'condition' | 'size'>>;
  onOpen: (id: string) => void;
  productPath?: string;
  favoriteSlot?: ReactNode;
  compact?: boolean;
};

const PLACEHOLDER_PATH = '#';

const priceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const wholePriceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function ProductCard({
  product,
  onOpen,
  productPath = PLACEHOLDER_PATH,
  favoriteSlot,
  compact = false,
}: ProductCardProps) {
  const details = [product.size, product.condition].filter(Boolean).join(' · ');
  const handleOpen = (event: MouseEvent<HTMLAnchorElement>) => {
    if (productPath === PLACEHOLDER_PATH) event.preventDefault();
    onOpen(product.id);
  };

  return (
    <div
      className={clsx(
        'group relative flex flex-col overflow-hidden border border-linha bg-papel shadow-[0_4px_6px_rgba(29,27,26,0.1)] transition-colors hover:border-texto-auxiliar',
        compact && 'tablet:shadow-none',
      )}
    >
      <div
        className={clsx(
          'aspect-[168/146] w-full shrink-0 overflow-hidden bg-papel-profundo p-2',
          compact && 'tablet:aspect-[3/4] tablet:bg-linha tablet:p-0',
        )}
      >
        <div
          className={clsx(
            'h-full w-full overflow-hidden border border-dashed border-tinta/25',
            compact && 'tablet:border-0',
          )}
        >
          {product.coverImageUrl ? (
            <img
              src={product.coverImageUrl}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
            />
          ) : (
            <ProductImagePlaceholder productName={product.name} />
          )}
        </div>
      </div>

      <div
        className={clsx(
          'flex flex-1 flex-col gap-2 bg-papel p-2',
          compact && 'tablet:gap-1 tablet:bg-branco-quente tablet:p-3',
        )}
      >
        {product.category && (
          <span
            className={clsx(
              'block w-full whitespace-nowrap font-ui text-[8px] font-bold uppercase leading-normal tracking-[0.865px] text-vermelho-escuro',
              compact && 'tablet:text-texto-auxiliar',
            )}
          >
            {product.category}
          </span>
        )}

        <p
          className={clsx(
            'min-h-[34px] font-display text-[16px] leading-[1.05]',
            compact && 'tablet:font-ui tablet:leading-snug',
          )}
        >
          <Link
            to={productPath}
            onClick={handleOpen}
            className="line-clamp-2 text-tinta no-underline after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            {product.name}
          </Link>
        </p>

        <p
          className={clsx(
            'truncate font-ui text-[8px] leading-normal text-texto-auxiliar',
          )}
        >
          {product.store.name}
          {product.store.city ? ` - ${product.store.city}` : null}
        </p>

        <div className="mt-auto flex w-full items-end justify-between gap-2 border-t border-linha pt-2">
          <p className="font-ui text-[16px] font-bold leading-normal text-tinta">
            {Number.isInteger(product.price)
              ? wholePriceFormatter.format(product.price)
              : priceFormatter.format(product.price)}
          </p>
          {details ? (
            <p className="max-w-[50%] truncate text-right font-ui text-[10px] leading-normal text-texto-auxiliar">
              {details}
            </p>
          ) : null}
        </div>
      </div>
      {favoriteSlot ? <div className="absolute right-2 top-2 z-10">{favoriteSlot}</div> : null}
    </div>
  );
}

export default ProductCard;
