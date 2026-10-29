/**
 * Aviso mostrado acima do grid quando a busca não encontra correspondência
 * exata e o catálogo cai para sugestões (`SearchResult.match_type ===
 * 'fallback'`). `role="status"` para leitores de tela anunciarem o motivo
 * sem exigir foco.
 *
 * Uso:
 *   <SuggestionBlock reason={result.suggestions.reason} />
 */
type SuggestionBlockProps = {
  reason: string;
};

export function SuggestionBlock({ reason }: SuggestionBlockProps) {
  return (
    <div
      role="status"
      className="border border-linha bg-papel-profundo p-4 text-body text-texto-auxiliar"
    >
      {reason}
    </div>
  );
}
