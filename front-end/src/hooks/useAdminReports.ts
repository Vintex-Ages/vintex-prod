import { useCallback, useEffect, useRef, useState } from 'react';
import { listReports, OrderReportError } from '@/services/reportService';
import type { AdminOrderReport } from '@/types/report';

/** `forbidden` é o 403 (sem papel admin): não adianta tentar de novo. */
export type AdminReportsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'forbidden' }
  /** `page` é a última página carregada; `total`, o total de Reclamações no back. */
  | { status: 'ready'; reports: AdminOrderReport[]; page: number; total: number };

/**
 * Reclamações dos compradores para a administradora (FE-US025-2, #427; RN-78),
 * via `reportService.listReports`. Só leitura; a tela só desenha.
 *
 * - A ordem é a do service (mais recente primeiro); o hook não reordena.
 * - `loadMore()` acrescenta a próxima página. Falha nela não apaga a lista:
 *   vira `loadMoreError` e o botão continua lá para tentar de novo.
 * - `retry()` recomeça da primeira página, passando por `loading`.
 * - Resposta de consulta que ficou velha é descartada.
 *
 * Mesmo padrão de paginação do `useMyOrders` e de estados do `useReceiptQueue`.
 *
 * Usage:
 *   const { state, reports, hasMore, loadingMore, loadMoreError, loadMore, retry } =
 *     useAdminReports();
 */
export function useAdminReports() {
  const [state, setState] = useState<AdminReportsState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  // Só a consulta mais recente escreve; `busy` trava cliques repetidos antes do render.
  const latest = useRef(0);
  const busy = useRef(false);

  const loadFirstPage = useCallback(async () => {
    const request = ++latest.current;
    busy.current = false;
    setState({ status: 'loading' });
    setLoadingMore(false);
    setLoadMoreError(false);

    try {
      const { items, page, total } = await listReports({ page: 1 });
      if (request === latest.current) setState({ status: 'ready', reports: items, page, total });
    } catch (error) {
      if (request !== latest.current) return;
      const forbidden = error instanceof OrderReportError && error.code === 'FORBIDDEN';
      setState({ status: forbidden ? 'forbidden' : 'error' });
    }
  }, []);

  useEffect(() => {
    void loadFirstPage();
    // Desmontou: nenhuma resposta pendente escreve mais.
    return () => {
      latest.current += 1;
    };
  }, [loadFirstPage]);

  const hasMore = state.status === 'ready' && state.reports.length < state.total;

  const loadMore = useCallback(async () => {
    if (state.status !== 'ready' || !hasMore || busy.current) return;
    busy.current = true;
    const request = latest.current;
    setLoadingMore(true);
    setLoadMoreError(false);

    try {
      const next = await listReports({ page: state.page + 1 });
      if (request !== latest.current) return;
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              reports: [...current.reports, ...next.items],
              page: next.page,
              total: next.total,
            }
          : current,
      );
    } catch {
      if (request === latest.current) setLoadMoreError(true);
    } finally {
      if (request === latest.current) {
        busy.current = false;
        setLoadingMore(false);
      }
    }
  }, [state, hasMore]);

  const retry = useCallback(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const reports = state.status === 'ready' ? state.reports : [];

  return { state, reports, hasMore, loadingMore, loadMoreError, loadMore, retry };
}
