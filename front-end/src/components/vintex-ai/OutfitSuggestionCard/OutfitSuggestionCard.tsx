import type { SVGProps } from 'react';
import Button from '@/components/common/Button';
import type { OutfitItemIcon, OutfitSuggestion } from '@/types/vintex-ai';

interface OutfitSuggestionCardProps {
  suggestion: OutfitSuggestion;
  /** Chamado ao clicar em "Salvar rascunho". */
  onSaveDraft?: () => void;
  /** Chamado ao clicar em "Ver peças". */
  onViewItems?: () => void;
}

function ShirtIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M8 3 4 6l1.5 3L8 8v11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V8l2.5 1L20 6l-4-3-2 2h-4L8 3Z" />
    </svg>
  );
}

function PantsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7 3h10l0.6 6-2.6 12-2-9-2 9-2.6-12L7 3Z" />
    </svg>
  );
}

function BagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7 8V6a5 5 0 0 1 10 0v2" />
      <rect x="4" y="8" width="16" height="12" rx="1" />
    </svg>
  );
}

const ITEM_ICONS: Record<OutfitItemIcon, (props: SVGProps<SVGSVGElement>) => JSX.Element> = {
  shirt: ShirtIcon,
  pants: PantsIcon,
  bag: BagIcon,
};

/**
 * Card de apresentação de uma sugestão de look da Vintex AI: título,
 * descrição, peças (ícone de categoria + rótulo), uma nota e duas ações.
 *
 * Componente de apresentação puro — não busca dados nem decide o que as
 * ações fazem, quem usa o card passa os callbacks. Os tipos vêm de
 * `@/types/vintex-ai` (contrato definido em #138, não redeclarado aqui).
 * As ações reaproveitam o `Button` do design system (`@/components/common/Button`,
 * #123) nas variantes `success` ("Salvar rascunho") e `secondary`
 * ("Ver peças") — hover/focus-visible são herdados dele, conforme
 * `.ai/interaction-states.md`. Cores só via token (`border-linha`,
 * `bg-papel-profundo`, sombra com `theme(colors.texto-auxiliar)`), sem hex.
 *
 * Usage:
 *   import { OutfitSuggestionCard } from '@/components/vintex-ai/OutfitSuggestionCard';
 *
 *   <OutfitSuggestionCard
 *     suggestion={suggestion}
 *     onSaveDraft={() => salvarRascunho(suggestion)}
 *     onViewItems={() => verPecas(suggestion)}
 *   />
 */
export function OutfitSuggestionCard({
  suggestion,
  onSaveDraft,
  onViewItems,
}: OutfitSuggestionCardProps) {
  return (
    <div className="mt-4 rounded-none border border-linha bg-branco-quente p-4 shadow-[0_8px_20px_-6px_theme(colors.texto-auxiliar)]">
      <p className="font-display text-body font-semibold text-tinta">{suggestion.title}</p>
      <p className="mt-1 text-body text-texto-auxiliar">{suggestion.description}</p>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {suggestion.items.map((item) => {
          const Icon = ITEM_ICONS[item.icon];
          return (
            <div key={item.id}>
              <div className="flex aspect-square w-full items-center justify-center rounded-none border border-linha bg-papel-profundo">
                <Icon className="h-8 w-8 text-texto-auxiliar" />
              </div>
              <p className="mt-2 text-label text-texto-auxiliar">{item.label}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-body text-texto-auxiliar">{suggestion.note}</p>

      <div className="mt-4 flex gap-2">
        <div className="flex-1 tablet:min-w-0">
          <Button
            variant="success"
            onClick={onSaveDraft}
            className="w-full tablet:whitespace-nowrap"
          >
            Salvar rascunho
          </Button>
        </div>
        <div className="flex-1 tablet:min-w-0">
          <Button
            variant="secondary"
            onClick={onViewItems}
            className="w-full tablet:whitespace-nowrap"
          >
            Ver peças
          </Button>
        </div>
      </div>
    </div>
  );
}

export default OutfitSuggestionCard;
