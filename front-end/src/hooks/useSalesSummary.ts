import { useCallback, useEffect, useState } from 'react';
import {
  getSalesSummary,
  NOT_AVAILABLE_YET,
  SellerProductError,
  type SalesPeriod,
} from '@/services/sellerProductService';
import type { SalesSummary } from '@/types/product';

export type SalesSummaryState =
  | { status: 'loading' }
  | { status: 'error' }
  /** A rota ainda não existe no back (`docs/adr/0002`): tentar de novo não resolve. */
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; summary: SalesSummary };

/**
 * Visão financeira do painel (FE-US019-3, #222, RN-51.1): resumo de vendas do
 * período escolhido. Bruto, comissão e líquido vêm calculados pelo back
 * (`GET /users/me/sales/summary?period=`, back-end#146); no mock, pela regra
 * de `utils/commission.ts`. Trocar o período refaz a consulta e volta ao
 * estado de carregamento; a resposta de um período que já foi trocado é
 * descartada.
 *
 * Usage:
 *   const { state, period, setPeriod, retry } = useSalesSummary();
 *   if (state.status === 'ready') formatCentsToBRL(state.summary.net * 100);
 */
export function useSalesSummary(initialPeriod: SalesPeriod = 'month') {
  const [period, setPeriodState] = useState<SalesPeriod>(initialPeriod);
  const [state, setState] = useState<SalesSummaryState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    getSalesSummary(period)
      .then((summary) => {
        if (!cancelled) setState({ status: 'ready', summary });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof SellerProductError && error.code === NOT_AVAILABLE_YET) {
          setState({ status: 'unavailable', message: error.message });
        } else {
          setState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [period, attempt]);

  const setPeriod = useCallback((next: SalesPeriod) => setPeriodState(next), []);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  return { state, period, setPeriod, retry };
}
