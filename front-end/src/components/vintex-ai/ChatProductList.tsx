import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import { productDetail } from '@/routes/paths';
import type { Product } from '@/types/product';

export type ChatProductListProps = {
  products: Product[];
  onOpen?: (id: string) => void;
  title?: string;
};

const priceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Apresenta os produtos recebidos, em coluna até três peças e em faixa horizontal
 * acima disso. O Link cuida da navegação; onOpen apenas notifica ativações normais.
 *
 * Uso: <ChatProductList products={products} title="Peças sugeridas" />
 */
export function ChatProductList({
  products,
  onOpen,
  title,
}: ChatProductListProps): JSX.Element | null {
  if (products.length === 0) return null;

  const isHorizontal = products.length > 3;

  function handleOpen(event: MouseEvent<HTMLAnchorElement>, id: string): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    onOpen?.(id);
  }

  return (
    <div className="min-w-0 w-full">
      {title ? <h3 className="mb-3 text-body font-semibold text-tinta">{title}</h3> : null}

      <ul
        className={clsx(
          'flex gap-3',
          isHorizontal ? 'flex-nowrap overflow-x-auto pb-2' : 'flex-col',
        )}
      >
        {products.map((product) => (
          <li
            key={product.id}
            className={clsx(
              'flex gap-3 border border-linha bg-papel p-3',
              isHorizontal && 'w-64 max-w-full shrink-0',
            )}
          >
            <div className="h-20 w-16 shrink-0 overflow-hidden bg-linha">
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

            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-body-sm font-medium text-tinta">{product.name}</p>
              <p className="text-body-sm font-bold text-tinta">
                {priceFormatter.format(product.price)}
              </p>
              <p className="truncate text-label text-texto-auxiliar">{product.store.name}</p>
              <Link
                to={productDetail(product.id)}
                onClick={(event) => handleOpen(event, product.id)}
                aria-label={`Ver peça: ${product.name}`}
                className="text-body-sm font-medium text-vermelho-escuro hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
              >
                Ver peça
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
