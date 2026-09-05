import type { KeyboardEvent, ReactNode } from 'react';

/**
 * TEMPORARY type — ainda não existe um contrato `Product` compartilhado em
 * `src/types` (a task FE-SVC-catalog, responsável por criá-lo, não foi
 * implementada). Quando ela existir, substitua este type pelo oficial e
 * remova esta definição local.
 *
 * `category` é `string` (não `string[]`) porque o design mostra apenas uma
 * categoria por cartão; revise este campo junto com o type oficial caso o
 * catálogo passe a suportar múltiplas categorias por produto.
 */
export type Product = {
  id: string;
  title: string;
  category: string;
  storeName: string;
  city: string;
  price: number;
  coverImageUrl?: string | null;
  condition: string;
};

export type ProductCardProps = {
  product: Product;
  onOpen: (id: string) => void;
  favoriteSlot?: ReactNode;
};

const priceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Cartão de produto do catálogo — apenas apresentação e navegação genérica
 * (`onOpen`). Sem busca de dados, sem validação de fluxo: quem chama decide o
 * que `onOpen`/`favoriteSlot` significam na tela onde o cartão é usado.
 *
 * Usage:
 *   import ProductCard from '@/components/product/ProductCard';
 *   <ProductCard
 *     product={product}
 *     onOpen={(id) => navigate(`/produto/${id}`)}
 *     favoriteSlot={<FavoriteButton productId={product.id} />}
 *   />
 */
function ProductCard({ product, onOpen, favoriteSlot }: ProductCardProps) {
  const handleOpen = () => onOpen(product.id);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={product.title}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer flex-col overflow-hidden rounded-lg border border-linha bg-branco-quente"
    >
      <div className="relative aspect-square w-full shrink-0 bg-linha">
        {product.coverImageUrl ? (
          <img
            src={product.coverImageUrl}
            alt={product.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            role="img"
            aria-label={product.title}
            className="flex h-full w-full items-center justify-center text-texto-auxiliar"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-10 w-10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16.5 8.5 12l3 3L16 10.5 20 15M4 6h16v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6Z"
              />
            </svg>
          </div>
        )}

        {favoriteSlot ? (
          <div
            className="absolute right-2 top-2"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {favoriteSlot}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1 p-3">
        <span className="text-label uppercase tracking-wide text-texto-auxiliar">
          {product.category}
        </span>
        <p className="text-body font-medium text-tinta">{product.title}</p>
        <p className="text-label text-texto-auxiliar">
          {product.storeName} · {product.city}
        </p>
        <p className="text-body font-semibold text-tinta">{priceFormatter.format(product.price)}</p>
        <p className="text-label text-texto-auxiliar">{product.condition}</p>
      </div>
    </div>
  );
}

export default ProductCard;
