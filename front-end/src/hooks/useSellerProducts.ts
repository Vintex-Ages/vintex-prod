import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMine } from '@/services/sellerProductService';
import type { ProductStatus, SellerProduct } from '@/types/product';

/** Chips do painel (RN-51). `rascunho` não vira status visível — ver #220. */
export type StatusFilter = 'todas' | 'ativo' | 'vendido' | 'despublicado';

export type SellerProductsCounts = {
  ativo: number;
  vendido: number;
  despublicado: number;
  total: number;
};

export type SellerProductsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; products: SellerProduct[]; counts: SellerProductsCounts };

/** Uma peça sem status conhecido não entra em nenhuma contagem. */
function contar(products: SellerProduct[]): SellerProductsCounts {
  return {
    ativo: products.filter((product) => product.status === 'ativo').length,
    vendido: products.filter((product) => product.status === 'vendido').length,
    despublicado: products.filter((product) => product.status === 'despublicado').length,
    total: products.length,
  };
}

/**
 * Peças do vendedor logado para o painel (FE-US019-1, #220), com as contagens
 * por status e o filtro dos chips.
 *
 * Busca a lista inteira uma vez em vez de refazer a consulta a cada chip: o
 * painel precisa das contagens dos três StatCards de qualquer forma, e o
 * critério de aceite pede que o filtro troque a lista sem recarregar. O
 * `getMine` aceita `?status=`, e vale trocar para isso quando o volume de
 * peças por vendedor justificar paginar no servidor.
 *
 * Peça vendida continua na lista (RN-52, histórico) — quem esconde ação é a
 * FE-US019-2, não este hook.
 *
 * Usage:
 *   const { state, filter, setFilter, visible, retry } = useSellerProducts();
 */
export function useSellerProducts() {
  const [state, setState] = useState<SellerProductsState>({ status: 'loading' });
  const [filter, setFilter] = useState<StatusFilter>('todas');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Descarta a resposta de uma consulta que ficou velha (desmontou ou
    // `retry` disparou outra antes desta voltar).
    let cancelled = false;

    getMine()
      .then((page) => {
        if (!cancelled) {
          setState({ status: 'ready', products: page.items, counts: contar(page.items) });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  const visible = useMemo(() => {
    if (state.status !== 'ready') return [];
    if (filter === 'todas') return state.products;
    return state.products.filter((product) => product.status === (filter as ProductStatus));
  }, [state, filter]);

  return { state, filter, setFilter, visible, retry };
}
