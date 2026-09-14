import { EmptyState } from '@/components/common/EmptyState';
import { FavoriteButton } from '@/components/common/FavoriteButton';
import ProductCard from '@/components/product/ProductCard';
import { ProductCardSkeleton } from '@/components/product/ProductCardSkeleton';
import type { ProductCardProps } from '@/components/product/ProductCard';

type ProductGridProps = {
  products: ProductCardProps['product'][];
  loading?: boolean;
  skeletonCount?: number;
  onOpen: (id: string) => void;
  /**
   * Monta a rota real da peça a partir do id (ex.: `productDetail`). Sem ela o
   * cartão cai no placeholder `'#'` do `ProductCard`: ctrl+clique, botão do
   * meio e "copiar endereço do link" ficam mortos.
   *
   * Com `productPath`, quem navega é o `<Link>` do cartão — então `onOpen`
   * NÃO deve navegar também, senão empilha duas entradas no histórico e o
   * "voltar" do navegador não sai da peça. Ver o JSDoc do `ProductCard`.
   */
  productPath?: (id: string) => string;
  onToggleFavorite?: (id: string) => void;
  isFavorite?: (id: string) => boolean;
};

/**
 * Composição visual do catálogo.
 * Renderiza skeletons durante o carregamento, EmptyState quando não há produtos
 * e ProductCard em uma grade responsiva quando existem itens.
 *
 * Usage:
 * import { ProductGrid } from '@/components/product/ProductGrid';
 * <ProductGrid
 *   products={products}
 *   loading={loading}
 *   onOpen={handleOpen}
 *   onToggleFavorite={handleToggleFavorite}
 *   isFavorite={(id) => favorites.includes(id)}
 * />
 */
export function ProductGrid({
  products,
  loading = false,
  skeletonCount = 6,
  onOpen,
  productPath,
  onToggleFavorite,
  isFavorite,
}: ProductGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 tablet:grid-cols-3 web:grid-cols-4">
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return <EmptyState message="Nenhuma peça encontrada no momento." />;
  }

  return (
    <div className="grid grid-cols-2 gap-4 tablet:grid-cols-3 web:grid-cols-4">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onOpen={onOpen}
          productPath={productPath?.(product.id)}
          favoriteSlot={
            onToggleFavorite && isFavorite ? (
              <FavoriteButton
                active={isFavorite(product.id)}
                onToggle={() => onToggleFavorite(product.id)}
              />
            ) : undefined
          }
        />
      ))}
    </div>
  );
}
