import { useCallback, useEffect, useState } from 'react';
import { AdminReceiptError, listReceipts } from '@/services/adminReceiptService';
import type { ReceiptReview } from '@/types/admin';
import type { PaymentStatus } from '@/types/order';

/** Filtro da fila: "Todos" não manda `status` ao service. */
export type ReceiptFilter = 'todos' | PaymentStatus;

/** `forbidden` é o 403 (sem papel admin): não adianta tentar de novo. */
export type ReceiptQueueState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'forbidden' }
  | { status: 'ready'; items: ReceiptReview[] };

/**
 * Consulta a fila de comprovantes da administradora (FE-US032-1) via
 * `adminReceiptService.listReceipts`. Guarda o filtro, o termo de busca
 * (comprador ou loja) e o estado da consulta; a tela só desenha.
 *
 * Usage:
 *   const { state, filter, setFilter, search, retry } = useReceiptQueue();
 *   <FilterChip label="Pendentes" active={filter === 'pendente'} onToggle={() => setFilter('pendente')} />
 */
export function useReceiptQueue() {
  const [state, setState] = useState<ReceiptQueueState>({ status: 'loading' });
  const [filter, setFilterState] = useState<ReceiptFilter>('todos');
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Descarta a resposta de uma consulta que ficou velha (filtro/busca mudou,
    // `retry` disparou outra ou a tela desmontou).
    let cancelled = false;

    listReceipts({
      status: filter === 'todos' ? undefined : filter,
      q: query || undefined,
    })
      .then(({ items }) => {
        if (!cancelled) setState({ status: 'ready', items });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const forbidden = error instanceof AdminReceiptError && error.code === 'FORBIDDEN';
        setState({ status: forbidden ? 'forbidden' : 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [filter, query, attempt]);

  // Valor igual ao atual não dispara nova consulta (o efeito não roda): nem
  // volta a "carregando", senão a fila trava no skeleton.
  const setFilter = useCallback(
    (next: ReceiptFilter) => {
      if (next === filter) return;
      setState({ status: 'loading' });
      setFilterState(next);
    },
    [filter],
  );

  const search = useCallback(
    (term: string) => {
      const next = term.trim();
      if (next === query) return;
      setState({ status: 'loading' });
      setQuery(next);
    },
    [query],
  );

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  return { state, filter, setFilter, search, retry };
}
