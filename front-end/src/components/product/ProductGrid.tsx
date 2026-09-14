import type { ReactNode } from 'react';
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
  /**
   * Estado vazio da tela. A grade não sabe *por que* está vazia — "ainda não
   * há peças" e "nenhuma peça com esses filtros" pedem textos e saídas
   * diferentes, e isso é contexto da página (`.ai/coding-rules.md`). Sem a
   * prop, cai num texto neutro.
   */
  emptyState?: ReactNode;
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
/**
 * Colunas da grade, num lugar só para o skeleton e a lista não divergirem.
 * `gap` cresce com a tela: 16px no celular, onde a margem lateral já é curta,
 * e 24px a partir de `tablet`, onde cartões colados ficam densos demais.
 */
const gridClassName = 'grid grid-cols-2 gap-4 tablet:grid-cols-3 tablet:gap-6 web:grid-cols-4';

export function ProductGrid({
  products,
  loading = false,
  skeletonCount = 8,
  onOpen,
  productPath,
  onToggleFavorite,
  isFavorite,
  emptyState,
}: ProductGridProps) {
  if (loading) {
    return (
      <div className={gridClassName}>
        {Array.from({ length: skeletonCount }).map((_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return <>{emptyState ?? <EmptyState message="Nenhuma peça encontrada no momento." />}</>;
  }

  return (
    <div className={gridClassName}>
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
