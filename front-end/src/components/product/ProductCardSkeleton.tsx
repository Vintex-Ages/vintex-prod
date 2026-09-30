/**
 * Skeleton visual do ProductCard exibido enquanto o catálogo está carregando.
 * Mantém a estrutura do cartão real e não possui regra de negócio.
 *
 * Pulsa de propósito: em blocos estáticos cinza a grade lia como layout
 * quebrado, não como carregamento. `motion-reduce` desliga a animação para
 * quem pediu menos movimento no sistema.
 *
 * Usage:
 * import { ProductCardSkeleton } from '@/components/product/ProductCardSkeleton';
 * <ProductCardSkeleton />
 */
export function ProductCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex animate-pulse flex-col overflow-hidden border border-linha bg-branco-quente motion-reduce:animate-none"
    >
      <div className="aspect-[168/146] w-full bg-papel-profundo p-2">
        <div className="h-full w-full border border-dashed border-linha bg-linha" />
      </div>

      <div className="flex flex-col gap-2 bg-papel p-2">
        <div className="h-2 w-3/4 bg-papel-profundo" />
        <div className="h-[34px] w-full bg-papel-profundo" />
        <div className="h-2 w-2/3 bg-papel-profundo" />
        <div className="mt-auto h-5 w-24 bg-papel-profundo" />
      </div>
    </div>
  );
}
