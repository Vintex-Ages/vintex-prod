/**
 * Skeleton visual do ProductCard exibido enquanto o catálogo está carregando.
 * Mantém aproximadamente a estrutura do cartão real e não possui regra de negócio.
 *
 * Usage:
 * import { ProductCardSkeleton } from '@/components/product/ProductCardSkeleton';
 * <ProductCardSkeleton />
 */
export function ProductCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col overflow-hidden border border-linha bg-branco-quente"
    >
      <div className="aspect-square w-full bg-linha" />

      <div className="flex flex-col gap-2 p-3">
        <div className="h-3 w-20 bg-papel-profundo" />
        <div className="h-5 w-3/4 bg-papel-profundo" />
        <div className="h-3 w-2/3 bg-papel-profundo" />
        <div className="h-5 w-24 bg-papel-profundo" />
        <div className="h-3 w-16 bg-papel-profundo" />
      </div>
    </div>
  );
}
