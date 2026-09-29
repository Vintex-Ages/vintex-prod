import { useCallback, useEffect, useState } from 'react';
import { getMyVerification, requestVerification } from '@/services/storeService';
import type { StoreVerification } from '@/types/store';

export type StoreVerificationState =
  | { status: 'loading' }
  | { status: 'error' }
  /** `verification: null` = o usuário não tem loja; o card não tem o que mostrar. */
  | { status: 'ready'; verification: StoreVerification | null };

/**
 * Selo Confiável da loja do vendedor logado (FE-US007-1, #224, RN-72/73):
 * lê a situação atual e dispara a validação simulada. `validate` devolve
 * `true` quando o selo virou Confiável, para a página decidir o aviso; em
 * erro devolve `false` e o estado anterior fica.
 *
 * Usage:
 *   const { state, validating, validate, retry } = useStoreVerification();
 *   if (await validate()) toast('Loja validada!', { kind: 'success' });
 */
export function useStoreVerification() {
  const [state, setState] = useState<StoreVerificationState>({ status: 'loading' });
  const [validating, setValidating] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    getMyVerification()
      .then((verification) => {
        if (!cancelled) setState({ status: 'ready', verification });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  const validate = useCallback(async (): Promise<boolean> => {
    setValidating(true);
    try {
      const store = await requestVerification();
      setState({ status: 'ready', verification: store.verification });
      return store.verification === 'confiavel';
    } catch {
      return false;
    } finally {
      setValidating(false);
    }
  }, []);

  return { state, validating, validate, retry };
}
