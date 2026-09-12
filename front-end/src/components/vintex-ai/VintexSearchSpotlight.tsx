import { useState } from 'react';
import clsx from 'clsx';
import { SearchBar } from '@/components/catalog/SearchBar';
import { FilterChip } from '@/components/catalog/FilterChip';

interface VintexSearchSpotlightProps {
  /** Texto pequeno acima do título (ex: "IA calibrada • Vintage 90s + Alfaiataria"). */
  eyebrow?: string;
  /** Pergunta principal, em destaque. */
  heading?: string;
  placeholder?: string;
  /** Chips de sugestão clicáveis, preenchem o campo de busca. */
  suggestions?: string[];
  onlineLabel?: string;
  isOnline?: boolean;
  /**
   * Chamado com o termo digitado (já sem espaços nas pontas) ao buscar.
   * O componente não navega — decidir o que fazer com a busca (ex: ir
   * para a tela de chat) é responsabilidade de quem o usa.
   */
  onSubmit?: (query: string) => void;
  /** Classes extras pro wrapper externo (ex: ajustar largura máxima). */
  className?: string;
}

/**
 * Hero de busca da assistente Vintex, para a versão desktop: moldura em
 * destaque com indicador "online", pergunta editorial e busca com
 * sugestões rápidas.
 *
 * Composição fina em cima do design system: o campo de busca é o
 * `SearchBar` (`@/components/catalog/SearchBar`, #120) e os chips de
 * sugestão são `FilterChip` (`@/components/catalog/FilterChip`, #134) na
 * variante não-removível — clicar preenche a busca, não navega. A moldura
 * (fundo + borda interna), o eyebrow, o heading e o indicador online são a
 * única parte nova deste componente.
 *
 * Usage:
 *   import { VintexSearchSpotlight } from '@/components/vintex-ai/VintexSearchSpotlight';
 *
 *   <VintexSearchSpotlight
 *     onSubmit={(query) => navigate('/vintex', { state: { message: query } })}
 *   />
 */
export function VintexSearchSpotlight({
  eyebrow = 'IA calibrada • Vintage 90s + Alfaiataria',
  heading = 'O que você procura hoje no RS?',
  placeholder = 'Descreva a peça ou estilo...',
  suggestions = ['Blazer de lã', 'Jeans anos 90', 'Camisa de seda'],
  onlineLabel = 'Online',
  isOnline = true,
  onSubmit,
  className,
}: VintexSearchSpotlightProps) {
  const [query, setQuery] = useState('');

  function handleSearchSubmit(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
    setQuery('');
  }

  function handleSuggestionClick(suggestion: string) {
    setQuery(suggestion);
  }

  return (
    <div className={clsx('w-full max-w-[820px] rounded-none bg-vermelho-escuro p-3', className)}>
      <div className="flex min-h-[500px] flex-col border border-vermelho-suave p-8">
        <div className="flex items-center justify-between gap-4">
          <p className="text-label font-semibold uppercase tracking-wide text-branco-quente/80">
            {eyebrow}
          </p>
          {isOnline ? (
            <p className="flex flex-shrink-0 items-center gap-2 text-label font-semibold uppercase tracking-wide text-branco-quente/80">
              <span className="h-2 w-2 rounded-full bg-dourado" aria-hidden="true" />
              {onlineLabel}
            </p>
          ) : null}
        </div>

        <h2 className="mt-6 font-display text-h2 font-semibold leading-tight text-branco-quente">
          {heading}
        </h2>

        <div className="mt-8">
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={handleSearchSubmit}
            placeholder={placeholder}
          />
        </div>

        {suggestions.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {suggestions.map((suggestion) => (
              <FilterChip
                key={suggestion}
                label={suggestion}
                onToggle={() => handleSuggestionClick(suggestion)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default VintexSearchSpotlight;
