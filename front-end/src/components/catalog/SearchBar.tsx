import { type FormEvent } from 'react';
import clsx from 'clsx';

/**
 * SearchBar — campo de busca com lupa e botão de envio. Emite o termo digitado
 * via `onChange`/`onSubmit`; a chamada à API fica na página/service que usa o
 * componente — ver `.ai/coding-rules.md`.
 *
 * Duas decisões de revisão visual:
 *
 * - **O botão é a cor de ação.** Era `verde-rs`, que na paleta significa
 *   "confiança e confirmação" (selo Confiável, checkbox marcado) e não ação.
 *   Buscar é ação, então usa `vermelho-escuro` como os demais CTAs.
 * - **O botão diz o que faz.** O ícone era uma seta para cima, que lê como
 *   "enviar mensagem" e não como "buscar" — e a lupa decorativa da esquerda
 *   não é clicável. Agora o rótulo é texto (`submitLabel`), o que também
 *   resolve o uso na conversa com a Vintex, onde a mesma barra envia mensagem
 *   e o verbo certo é "Enviar".
 *
 * Uso:
 *   <SearchBar value={term} onChange={setTerm} onSubmit={handleSearch} />
 *   <SearchBar value={draft} onChange={setDraft} onSubmit={send} submitLabel="Enviar" />
 */
type SearchBarProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (term: string) => void;
  placeholder?: string;
  loading?: boolean;
  /** Verbo do botão. Default "Buscar"; a conversa com a Vintex usa "Enviar". */
  submitLabel?: string;
  /** `sm` encolhe a altura para caber na barra do cabeçalho. */
  size?: 'md' | 'sm';
};

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Busque por peça, marca ou brechó…',
  loading = false,
  submitLabel = 'Buscar',
  size = 'md',
}: SearchBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    onSubmit(value);
  }

  const compact = size === 'sm';

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className={clsx(
        'flex w-full items-stretch overflow-hidden border border-linha bg-branco-quente',
        'focus-within:border-tinta focus-within:ring-1 focus-within:ring-tinta',
      )}
    >
      <span
        className={clsx('flex items-center text-texto-auxiliar', compact ? 'pl-2.5' : 'pl-3')}
        aria-hidden="true"
      >
        <SearchIcon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </span>

      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Buscar"
        className={clsx(
          'min-w-0 flex-1 bg-transparent font-ui text-tinta outline-none placeholder:text-texto-auxiliar',
          // `appearance-none` tira o "x" nativo do type=search, que o Chrome
          // desenha por cima da borda e não acompanha a paleta.
          '[&::-webkit-search-cancel-button]:appearance-none',
          compact ? 'px-2 py-1.5 text-body-sm' : 'px-2 py-2.5 text-body',
        )}
      />

      <button
        type="submit"
        disabled={loading}
        className={clsx(
          'flex shrink-0 items-center justify-center gap-2 bg-vermelho-escuro font-semibold text-branco-quente transition',
          'hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-branco-quente',
          'disabled:cursor-not-allowed disabled:opacity-70',
          compact ? 'px-3 text-body-sm' : 'px-4 text-body',
        )}
      >
        {loading ? (
          <>
            <svg
              aria-hidden="true"
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 12a9 9 0 1 1-9-9" />
            </svg>
            <span className="sr-only">Buscando</span>
          </>
        ) : (
          submitLabel
        )}
      </button>
    </form>
  );
}
