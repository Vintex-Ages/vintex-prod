import { useCallback, useEffect, useState } from 'react';
import { getMyStore } from '@/services/storeService';
import type { StoreProfile } from '@/types/store';

/**
 * Estado da consulta à loja do usuário logado. `ready` com `store: null` é o
 * estado "vazio": a consulta deu certo e o usuário não tem loja.
 */
export type MyStoreState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; store: StoreProfile | null };

/**
 * Busca a loja do usuário logado via `storeService.getMyStore` (FE-US006-2,
 * #213). Quem chama decide o que fazer com cada estado — a guarda
 * `RequireStore` redireciona, uma tela poderia mostrar outra coisa.
 *
 * Só deve ser usado com sessão ativa: `getMyStore` consulta o usuário atual.
 *
 * Usage:
 *   const { state, retry } = useMyStore();
 *   if (state.status === 'error') return <ErrorState message="…" onRetry={retry} />;
 */
export function useMyStore(): { state: MyStoreState; retry: () => void } {
  const [state, setState] = useState<MyStoreState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Descarta a resposta de uma consulta que ficou velha (desmontou ou
    // `retry` disparou outra antes desta voltar).
    let cancelled = false;

    getMyStore()
      .then((store) => {
        if (!cancelled) setState({ status: 'ready', store });
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

  return { state, retry };
}
