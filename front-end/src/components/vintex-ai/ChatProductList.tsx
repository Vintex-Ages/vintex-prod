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
  /** `cards` = cartão de alternativas (só resultado `fallback`, #438). */
  layout?: 'list' | 'cards';
};

const priceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Apresenta os produtos recebidos, em coluna até três peças e em faixa horizontal
 * acima disso. O Link cuida da navegação; onOpen apenas notifica ativações normais.
 *
 * `layout="cards"` reúne as peças num cartão com selo: até três em grade de colunas
 * iguais, acima disso em faixa horizontal de colunas com largura fixa.
 *
 * Uso: <ChatProductList products={products} title="Peças sugeridas" />
 *      <ChatProductList products={products} title="Alternativas próximas" layout="cards" />
 */
export function ChatProductList({
  products,
  onOpen,
  title,
  layout = 'list',
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

  if (layout === 'cards') {
    return (
      <div
        data-testid="chat-product-cards"
        className="relative min-w-0 w-full -rotate-[0.45deg] border border-linha bg-branco-quente p-3 shadow-[4px_4px_0_0_theme(colors.papel-profundo),0_4px_6px_0_theme(colors.tinta/0.08)]"
      >
        <span
          aria-hidden="true"
          data-testid="chat-product-frame"
          className="pointer-events-none absolute inset-[5.6px] border border-dourado/55"
        />

        <div className="mb-3 flex items-start justify-between gap-2">
          {title ? (
            <h3 className="min-w-0 font-display text-h4 tracking-tight text-tinta">{title}</h3>
          ) : null}
          <p
            data-testid="chat-product-seal"
            className="ml-auto flex size-[72px] shrink-0 rotate-[7deg] flex-col items-center justify-center rounded-full border border-verde-rs text-center text-label uppercase text-verde-rs"
          >
            <span>{products.length}</span>
            <span>{products.length === 1 ? 'achado' : 'achados'}</span>
            <span>{products.length === 1 ? 'real' : 'reais'}</span>
          </p>
        </div>

        <ul
          className={clsx(
            'items-stretch gap-[7px]',
            isHorizontal ? 'flex flex-nowrap overflow-x-auto pb-2' : 'grid grid-cols-3',
          )}
        >
          {products.map((product) => (
            <li
              key={product.id}
              className={clsx(
                'flex min-w-0 flex-col border border-linha bg-papel-profundo p-1.5',
                isHorizontal && 'w-32 shrink-0',
              )}
            >
              <div className="aspect-[4/5] w-full overflow-hidden bg-linha">
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

              <p className="mt-1.5 line-clamp-2 text-label font-semibold text-tinta">
                {product.name}
              </p>
              <p className="text-label font-bold text-tinta">
                {priceFormatter.format(product.price)}
              </p>
              <p className="truncate text-label text-texto-auxiliar" title={product.store.name}>
                {product.store.name}
              </p>
              <Link
                to={productDetail(product.id)}
                onClick={(event) => handleOpen(event, product.id)}
                aria-label={`Ver peça: ${product.name}`}
                className="mt-auto text-label font-medium text-vermelho-escuro hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
              >
                Ver peça
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
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
