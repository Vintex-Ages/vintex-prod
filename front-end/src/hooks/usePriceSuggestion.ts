import { useCallback, useRef, useState } from 'react';
import { suggestPrice } from '@/services/vintexAiService';
import { priceRangePosition } from '@/utils/priceSuggestion';
import type { PriceSuggestion, PriceSuggestionInput } from '@/types/vintex-ai';

/** Estado da sugestão de preço, no formato que o `PriceSuggestion` desenha. */
export interface PriceSuggestionState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  suggestion?: PriceSuggestion;
}

const IDLE: PriceSuggestionState = { status: 'idle' };

/**
 * Preço fora da faixa da sugestão (RN-68): `'below'`, `'above'` ou `null`
 * quando está dentro, sem preço, sem sugestão pedida ou sem base (back-end#254).
 */
export function priceOutOfRange(
  state: PriceSuggestionState,
  priceReais: number | null,
): 'below' | 'above' | null {
  const suggestion = state.status === 'ready' ? state.suggestion : undefined;
  if (!suggestion || suggestion.min === null || suggestion.max === null) return null;
  const position = priceRangePosition(priceReais, { min: suggestion.min, max: suggestion.max });
  return position === 'below' || position === 'above' ? position : null;
}

/**
 * Sugestão de preço do cadastro da peça (FE-US018-1, #326).
 *
 * - Só pede quando o vendedor clica (RN-67): nada aqui roda sozinho.
 * - Falha de rede ou do back vira `unavailable`, um aviso discreto; o cadastro
 *   segue (VS-018, cenário 3).
 * - Não é salva com a peça: some em `reset()`, que o `useProductForm` chama ao
 *   trocar de peça. Reabrir a peça depois pede de novo.
 * - Resposta de um pedido que ficou velho (outro clique ou `reset`) é descartada.
 *
 * Usage:
 *   const preco = usePriceSuggestion();
 *   void preco.request({ name: 'Jaqueta', category: 'Roupas' });
 *   <PriceSuggestion state={preco.state.status} suggestion={preco.state.suggestion} … />
 */
export function usePriceSuggestion() {
  const [state, setState] = useState<PriceSuggestionState>(IDLE);
  const latest = useRef(0);

  const request = useCallback(async (input: PriceSuggestionInput) => {
    const current = ++latest.current;
    setState({ status: 'loading' });
    try {
      const suggestion = await suggestPrice(input);
      if (current === latest.current) setState({ status: 'ready', suggestion });
    } catch {
      if (current === latest.current) setState({ status: 'unavailable' });
    }
  }, []);

  const reset = useCallback(() => {
    latest.current += 1;
    setState(IDLE);
  }, []);

  return { state, request, reset };
}
