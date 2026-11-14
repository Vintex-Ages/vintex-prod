import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyVerification, requestVerification } from '@/services/storeService';
import type { StoreProfile, StoreVerification } from '@/types/store';

/** Loja já carregada pela guarda; uma única fonte para leitura e atualização do selo. */
export type StoreVerificationSource = {
  store: StoreProfile;
  onStoreUpdated: (store: StoreProfile) => void;
};

export type StoreVerificationState =
  | { status: 'loading' }
  | { status: 'error' }
  /** `verification: null` = o usuário não tem loja; o card não tem o que mostrar. */
  | { status: 'ready'; verification: StoreVerification | null };

/**
 * Selo Confiável da loja do vendedor logado (FE-US007-1, #224, RN-72/73):
 * no painel, deriva o selo da loja recebida e só consulta a API na ação
 * explícita de validar. O modo sem `storeSource` preserva o uso isolado
 * anterior do card, inclusive loading, erro e retry.
 * `validate` só devolve true se a operação retornar selo Confiável; em
 * erro devolve false e preserva a loja anterior.
 *
 * Usage:
 *   const { state, validating, validate } = useStoreVerification({ store, onStoreUpdated });
 *   if (await validate()) toast('Loja validada!', { kind: 'success' });
 */
export function useStoreVerification(storeSource?: StoreVerificationSource) {
  const [legacyState, setLegacyState] = useState<StoreVerificationState>({ status: 'loading' });
  const [validating, setValidating] = useState(false);
  const validationInProgress = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const suppliedStore = storeSource?.store;

  const state: StoreVerificationState = suppliedStore
    ? { status: 'ready', verification: suppliedStore.verification }
    : legacyState;

  useEffect(() => {
    // O painel já recebeu a loja da guarda: nenhuma consulta exclusiva para o selo.
    if (suppliedStore) return;
    let cancelled = false;
    setLegacyState({ status: 'loading' });

    getMyVerification()
      .then((verification) => {
        if (!cancelled) setLegacyState({ status: 'ready', verification });
      })
      .catch(() => {
        if (!cancelled) setLegacyState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, suppliedStore]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  const validate = useCallback(async (): Promise<boolean> => {
    if (validationInProgress.current) return false;
    validationInProgress.current = true;
    setValidating(true);
    try {
      const store = await requestVerification();
      if (storeSource) {
        storeSource.onStoreUpdated(store);
      } else {
        setLegacyState({ status: 'ready', verification: store.verification });
      }
      return store.verification === 'confiavel';
    } catch {
      return false;
    } finally {
      validationInProgress.current = false;
      setValidating(false);
    }
  }, [storeSource]);

  return { state, validating, validate, retry };
}
