import AISuggestedTag from '@/components/common/AISuggestedTag';
import Button from '@/components/common/Button';
import { averagePrice, priceRangePosition } from '@/utils/priceSuggestion';
import type { PriceRange } from '@/utils/priceSuggestion';
import { formatCentsToBRL } from '@/utils/format';

export type PriceSuggestionValue = PriceRange & { justification: string };

export type PriceSuggestionProps = {
  state: 'idle' | 'loading' | 'ready' | 'unavailable';
  /** Faixa sugerida e justificativa; `min` e `max` em reais. */
  suggestion?: PriceSuggestionValue;
  /** Preço digitado, em reais; `null` ou ausente se vazio. */
  currentPrice?: number | null;
  onRequest: () => void;
  /** Recebe o valor sugerido (média da faixa), em reais. */
  onUse: (value: number) => void;
};

const OUT_OF_RANGE_MESSAGE = {
  below: 'Seu preço está abaixo da faixa sugerida. Você pode mantê-lo se preferir.',
  above: 'Seu preço está acima da faixa sugerida. Você pode mantê-lo se preferir.',
} as const;

/** `formatCentsToBRL` trabalha em centavos; o componente trabalha em reais. */
function formatReais(value: number): string {
  return formatCentsToBRL(Math.round(value * 100));
}

function SparkleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
      <path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      className="animate-spin"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

/**
 * Bloco de sugestão de preço pela IA, ao lado do `PriceInput` (RN-67, RN-68).
 * Só apresentação: a comparação com a faixa vem de `@/utils/priceSuggestion`
 * e o alerta de preço fora da faixa é informativo — nunca bloqueia nada.
 * Valores em reais, como no contrato da issue #308 (o `PriceInput` trabalha em
 * centavos, então a tela que une os dois precisa converter).
 *
 * Usage:
 *   import PriceSuggestion from '@/components/seller/PriceSuggestion';
 *   <PriceSuggestion state="idle" onRequest={pedirSugestao} onUse={setPreco} />
 *   <PriceSuggestion state="ready" suggestion={faixa} currentPrice={preco}
 *     onRequest={pedirSugestao} onUse={setPreco} />
 */
function PriceSuggestion({
  state,
  suggestion,
  currentPrice,
  onRequest,
  onUse,
}: PriceSuggestionProps) {
  const isLoading = state === 'loading';
  const showSuggestion = state === 'ready' && suggestion !== undefined;
  const comparison = showSuggestion ? priceRangePosition(currentPrice, suggestion) : 'none';
  const outOfRangeMessage =
    comparison === 'below' || comparison === 'above' ? OUT_OF_RANGE_MESSAGE[comparison] : null;

  return (
    <div className="flex flex-col gap-3" aria-busy={isLoading}>
      <button
        type="button"
        onClick={onRequest}
        disabled={isLoading}
        className="inline-flex items-center gap-2 self-start border border-tinta bg-branco-quente px-3 py-2 text-label font-bold uppercase tracking-wide text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-dourado">{isLoading ? <SpinnerIcon /> : <SparkleIcon />}</span>
        {isLoading ? 'Buscando sugestão…' : 'Sugerir preço com IA'}
      </button>

      {state === 'unavailable' ? (
        <p className="text-body-sm text-texto-auxiliar">
          Sugestão indisponível agora. Você pode seguir com o seu preço.
        </p>
      ) : null}

      {showSuggestion ? (
        <div className="flex flex-col gap-3 border border-linha bg-branco-quente p-4">
          <AISuggestedTag />
          <p className="text-h4 text-tinta">
            {formatReais(suggestion.min)} – {formatReais(suggestion.max)}
          </p>
          <p className="text-body-sm text-texto-auxiliar">{suggestion.justification}</p>
          <Button variant="primary" onClick={() => onUse(averagePrice(suggestion))}>
            Usar {formatReais(averagePrice(suggestion))}
          </Button>
        </div>
      ) : null}

      {outOfRangeMessage ? (
        <p
          role="status"
          className="border-l-2 border-dourado bg-papel-profundo px-3 py-2 text-body-sm text-tinta"
        >
          {outOfRangeMessage}
        </p>
      ) : null}
    </div>
  );
}

export default PriceSuggestion;
