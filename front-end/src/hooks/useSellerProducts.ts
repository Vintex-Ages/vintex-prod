import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMine, publish, unpublish } from '@/services/sellerProductService';
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

/** Tamanho de página ao buscar tudo; o `getMine` devolve só 20 por padrão. */
const PAGE_SIZE = 100;

/**
 * Busca todas as páginas do `getMine`. As contagens dos cards e o filtro em
 * memória precisam da lista inteira: com só a primeira página, um vendedor
 * com mais peças que o tamanho da página veria números e lista incompletos.
 */
async function buscarTodas(): Promise<SellerProduct[]> {
  const todas: SellerProduct[] = [];
  for (let page = 1; ; page += 1) {
    const resposta = await getMine({ page, pageSize: PAGE_SIZE });
    todas.push(...resposta.items);
    if (resposta.items.length === 0 || todas.length >= resposta.total) return todas;
  }
}

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
 * página, não este hook.
 *
 * Ações da FE-US019-2 (#221): `unpublishProduct` (ativo → despublicado) e
 * `republishProduct` (despublicado → ativo, pela mesma rota `publish` —
 * `republish` não existe). A linha muda de status sem recarregar a lista, e
 * as contagens acompanham. Erros do service sobem para a página decidir o
 * aviso (ex.: `PRODUCT_SOLD`).
 *
 * Usage:
 *   const { state, filter, setFilter, visible, retry, unpublishProduct } = useSellerProducts();
 *   await unpublishProduct(id); // lança SellerProductError se o back recusar
 */
export function useSellerProducts() {
  const [state, setState] = useState<SellerProductsState>({ status: 'loading' });
  const [filter, setFilter] = useState<StatusFilter>('todas');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Descarta a resposta de uma consulta que ficou velha (desmontou ou
    // `retry` disparou outra antes desta voltar).
    let cancelled = false;

    buscarTodas()
      .then((products) => {
        if (!cancelled) {
          setState({ status: 'ready', products, counts: contar(products) });
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

  /** Troca o status de uma peça na lista em memória e refaz as contagens. */
  const applyStatus = useCallback((id: string, status: SellerProduct['status']) => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      const products = current.products.map((product) =>
        product.id === id ? { ...product, status } : product,
      );
      return { status: 'ready', products, counts: contar(products) };
    });
  }, []);

  const unpublishProduct = useCallback(
    async (id: string) => {
      await unpublish(id);
      applyStatus(id, 'despublicado');
    },
    [applyStatus],
  );

  const republishProduct = useCallback(
    async (id: string) => {
      await publish(id);
      applyStatus(id, 'ativo');
    },
    [applyStatus],
  );

  const visible = useMemo(() => {
    if (state.status !== 'ready') return [];
    if (filter === 'todas') return state.products;
    return state.products.filter((product) => product.status === (filter as ProductStatus));
  }, [state, filter]);

  return { state, filter, setFilter, visible, retry, unpublishProduct, republishProduct };
}
