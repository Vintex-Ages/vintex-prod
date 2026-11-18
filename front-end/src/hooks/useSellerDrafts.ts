import { useCallback, useEffect, useState } from 'react';
import { discardDraft, getMine } from '@/services/sellerProductService';
import type { SellerProduct } from '@/types/product';

export type SellerDraftsState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; drafts: SellerProduct[] };

/** Mesmo tamanho de página do `useSellerProducts`: a aba lista todos os rascunhos. */
const PAGE_SIZE = 100;

async function buscarRascunhos(): Promise<SellerProduct[]> {
  const todos: SellerProduct[] = [];
  for (let page = 1; ; page += 1) {
    const resposta = await getMine({ status: 'rascunho', page, pageSize: PAGE_SIZE });
    todos.push(...resposta.items);
    if (resposta.items.length === 0 || todos.length >= resposta.total) {
      // Defensivo: a aba é só de rascunho, mesmo se a resposta trouxer outra situação.
      return todos.filter((product) => product.status === 'rascunho');
    }
  }
}

/**
 * Rascunhos do vendedor para a aba própria do painel (FE-US019-6, #345;
 * `docs/adr/0004`). Separado do `useSellerProducts` de propósito: rascunho é
 * cadastro pela metade, não peça do saldo (RN-51), e não pode mexer nas
 * contagens nem no total das peças.
 *
 * Quem usa só monta com a aba aberta: quem não olha os rascunhos não paga a
 * consulta. `discard()` apaga no back (back-end#271) e tira da lista depois
 * que a API confirma; o erro sobe para a página avisar.
 *
 * Usage:
 *   const { state, discard, retry } = useSellerDrafts();
 *   await discard(id); // lança SellerProductError se o back recusar
 */
export function useSellerDrafts() {
  const [state, setState] = useState<SellerDraftsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    buscarRascunhos()
      .then((drafts) => {
        if (!cancelled) setState({ status: 'ready', drafts });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  const discard = useCallback(async (id: string) => {
    await discardDraft(id);
    setState((current) =>
      current.status === 'ready'
        ? { status: 'ready', drafts: current.drafts.filter((draft) => draft.id !== id) }
        : current,
    );
  }, []);

  return { state, retry, discard };
}
