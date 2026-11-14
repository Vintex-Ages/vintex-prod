/**
 * Esqueleto da lista "Meus pedidos" enquanto `listMyOrders` não volta
 * (FE-US023-1, #321). Mesma estrutura do `OrderCard` (cabeçalho, miniatura e
 * texto, rodapé com badge e total), sem dados nem regra: só blocos pulsando.
 *
 * O contêiner anuncia o carregamento uma vez; cada cartão é `aria-hidden`
 * para o leitor de tela não ler blocos vazios. `motion-reduce` desliga a
 * animação para quem pediu menos movimento.
 *
 * Usage:
 *   import { OrderCardSkeleton } from '@/components/orders/OrderCardSkeleton';
 *   {state.status === 'loading' && <OrderCardSkeleton />}
 */
export function OrderCardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Carregando pedidos"
      aria-busy="true"
      className="flex w-full flex-col gap-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex animate-pulse flex-col gap-3 border border-linha bg-branco-quente p-4 motion-reduce:animate-none"
        >
          <div className="flex justify-between gap-3">
            <div className="h-4 w-32 bg-papel-profundo" />
            <div className="h-4 w-20 bg-papel-profundo" />
          </div>
          <div className="flex gap-3">
            <div className="h-16 w-16 shrink-0 bg-papel-profundo tablet:h-20 tablet:w-20" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-3/4 bg-papel-profundo" />
              <div className="h-3 w-1/2 bg-papel-profundo" />
            </div>
          </div>
          <div className="flex justify-between gap-3 border-t border-linha pt-3">
            <div className="h-5 w-28 rounded-full bg-papel-profundo" />
            <div className="h-5 w-20 bg-papel-profundo" />
          </div>
        </div>
      ))}
    </div>
  );
}
