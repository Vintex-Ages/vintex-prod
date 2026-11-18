import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdminModerationError,
  listSuspended,
  restoreProduct,
} from '@/services/adminModerationService';
import type { ModerationResult, SuspendedProduct } from '@/types/adminModeration';

const PAGE_SIZE = 20;

interface ModerationState {
  status: 'loading' | 'ready' | 'error' | 'forbidden';
  items: SuspendedProduct[];
  page: number;
  total: number;
  loadingMore: boolean;
  loadMoreError: boolean;
  reconciling: boolean;
  reconcileError: boolean;
  restoringIds: ReadonlySet<string>;
  restoreErrors: Record<string, string>;
}

const INITIAL_STATE: ModerationState = {
  status: 'loading',
  items: [],
  page: 0,
  total: 0,
  loadingMore: false,
  loadMoreError: false,
  reconciling: false,
  reconcileError: false,
  restoringIds: new Set(),
  restoreErrors: {},
};

function restorationError(error: unknown): string {
  if (error instanceof AdminModerationError) {
    if (error.code === 'NO_IMAGE' || error.fields?.images) {
      return 'O anúncio precisa de ao menos uma foto para ser restaurado.';
    }
    if (error.httpStatus === 422) {
      return Object.values(error.fields ?? {})[0] ?? error.message;
    }
    if (error.code === 'FORBIDDEN') return 'Você não tem permissão para restaurar este anúncio.';
    if (error.code === 'AUTH_REQUIRED')
      return 'Sua sessão precisa ser renovada para restaurar o anúncio.';
    if (error.code === 'PRODUCT_NOT_SUSPENDED')
      return 'Esta peça já não está suspensa. Atualize a lista.';
  }
  return 'Não foi possível restaurar o anúncio. Tente novamente.';
}

function uniqueItems(items: SuspendedProduct[]): SuspendedProduct[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

/** Lista administrativa local; só o service decide quais peças são Suspensas.
 * Uma remoção invalida os offsets: o prefixo já carregado é consultado novamente
 * e publicado de uma vez. Em falha, os cartões restantes continuam disponíveis.
 */
export function useAdminModeration() {
  const [state, setState] = useState<ModerationState>(INITIAL_STATE);
  const current = useRef(state);
  const mounted = useRef(false);
  const lifetime = useRef(0);
  const latest = useRef(0);
  const queryBusy = useRef(false);
  const pendingRestores = useRef(new Set<string>());
  const needsReconciliation = useRef(false);

  const update = useCallback((change: (previous: ModerationState) => ModerationState) => {
    if (!mounted.current) return;
    const next = change(current.current);
    current.current = next;
    setState(next);
  }, []);

  const loadFirstPage = useCallback(async () => {
    const request = ++latest.current;
    queryBusy.current = true;
    update((previous) => ({
      ...previous,
      status: 'loading',
      loadingMore: false,
      loadMoreError: false,
    }));
    try {
      const first = await listSuspended({ page: 1, pageSize: PAGE_SIZE });
      if (!mounted.current || request !== latest.current) return;
      update((previous) => ({
        ...previous,
        status: 'ready',
        items: uniqueItems(first.items),
        page: first.page,
        total: first.total,
        reconcileError: false,
        reconciling: false,
      }));
    } catch (error) {
      if (request !== latest.current) return;
      const forbidden = error instanceof AdminModerationError && error.code === 'FORBIDDEN';
      update((previous) => ({ ...previous, status: forbidden ? 'forbidden' : 'error' }));
    } finally {
      if (request === latest.current) queryBusy.current = false;
    }
  }, [update]);

  useEffect(() => {
    mounted.current = true;
    void loadFirstPage();
    return () => {
      mounted.current = false;
      lifetime.current += 1;
      latest.current += 1;
    };
  }, [loadFirstPage]);

  const reconcile = useCallback(async () => {
    const loadedPages = Math.max(1, current.current.page);
    const request = ++latest.current;
    queryBusy.current = true;
    update((previous) => ({
      ...previous,
      reconciling: true,
      loadingMore: false,
      loadMoreError: false,
    }));
    try {
      const first = await listSuspended({ page: 1, pageSize: PAGE_SIZE });
      if (!mounted.current || request !== latest.current) return;
      let items = first.items;
      let page = first.page;
      let total = first.total;
      const lastPage = Math.min(loadedPages, Math.max(1, Math.ceil(total / PAGE_SIZE)));
      for (let nextPage = 2; nextPage <= lastPage; nextPage += 1) {
        const next = await listSuspended({ page: nextPage, pageSize: PAGE_SIZE });
        if (!mounted.current || request !== latest.current) return;
        items = [...items, ...next.items];
        page = next.page;
        total = next.total;
      }
      update((previous) => ({
        ...previous,
        status: 'ready',
        items: uniqueItems(items),
        page,
        total,
        reconciling: false,
        reconcileError: false,
      }));
    } catch {
      if (request === latest.current) {
        update((previous) => ({ ...previous, reconciling: false, reconcileError: true }));
      }
    } finally {
      if (request === latest.current) queryBusy.current = false;
    }
  }, [update]);

  const loadMore = useCallback(async () => {
    const previous = current.current;
    if (
      previous.status !== 'ready' ||
      previous.items.length >= previous.total ||
      queryBusy.current ||
      pendingRestores.current.size > 0 ||
      previous.reconcileError
    )
      return;
    queryBusy.current = true;
    const request = latest.current;
    update((value) => ({ ...value, loadingMore: true, loadMoreError: false }));
    try {
      const next = await listSuspended({ page: previous.page + 1, pageSize: PAGE_SIZE });
      if (!mounted.current || request !== latest.current) return;
      update((value) => ({
        ...value,
        items: uniqueItems([...value.items, ...next.items]),
        page: next.page,
        total: next.total,
      }));
    } catch {
      if (request === latest.current) update((value) => ({ ...value, loadMoreError: true }));
    } finally {
      if (request === latest.current) {
        queryBusy.current = false;
        update((value) => ({ ...value, loadingMore: false }));
      }
    }
  }, [update]);

  const restore = useCallback(
    async (id: string): Promise<ModerationResult | null> => {
      if (
        current.current.status !== 'ready' ||
        current.current.reconciling ||
        current.current.reconcileError ||
        pendingRestores.current.has(id) ||
        !current.current.items.some((item) => item.id === id)
      )
        return null;
      const session = lifetime.current;
      pendingRestores.current.add(id);
      // Mesmo uma próxima página já em andamento não pode escrever após a mutação.
      latest.current += 1;
      queryBusy.current = false;
      update((previous) => {
        const restoreErrors = { ...previous.restoreErrors };
        delete restoreErrors[id];
        return {
          ...previous,
          restoringIds: new Set(pendingRestores.current),
          restoreErrors,
          loadingMore: false,
        };
      });
      let result: ModerationResult | null = null;
      try {
        result = await restoreProduct(id);
        if (!mounted.current || session !== lifetime.current) return null;
        needsReconciliation.current = true;
        update((previous) => ({
          ...previous,
          items: previous.items.filter((item) => item.id !== id),
          total: Math.max(0, previous.total - 1),
        }));
      } catch (error) {
        if (session === lifetime.current) {
          update((previous) => ({
            ...previous,
            restoreErrors: { ...previous.restoreErrors, [id]: restorationError(error) },
          }));
        }
      } finally {
        pendingRestores.current.delete(id);
        if (mounted.current && session === lifetime.current) {
          if (pendingRestores.current.size === 0 && needsReconciliation.current) {
            needsReconciliation.current = false;
            await reconcile();
          }
          update((previous) => ({ ...previous, restoringIds: new Set(pendingRestores.current) }));
        }
      }
      return result;
    },
    [reconcile, update],
  );

  const retry = useCallback(() => {
    if (pendingRestores.current.size > 0 || current.current.reconciling) return;
    if (current.current.reconcileError) void reconcile();
    else void loadFirstPage();
  }, [loadFirstPage, reconcile]);

  return {
    state,
    items: state.items,
    total: state.total,
    hasMore: state.status === 'ready' && state.items.length < state.total,
    loadingMore: state.loadingMore,
    loadMoreError: state.loadMoreError,
    reconciling: state.reconciling,
    reconcileError: state.reconcileError,
    restoringIds: state.restoringIds,
    restoreErrors: state.restoreErrors,
    restore,
    loadMore,
    retry,
  };
}
