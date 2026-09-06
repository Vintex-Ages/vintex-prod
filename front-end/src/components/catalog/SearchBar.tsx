import { type FormEvent } from 'react';
import clsx from 'clsx';

/**
 * SearchBar — campo de busca com ícone de lupa e botão de envio. Emite o termo
 * digitado via `onChange`/`onSubmit`; a chamada à API fica na página/service
 * que usa o componente — ver `.ai/coding-rules.md`.
 *
 * Uso:
 *   <SearchBar value={term} onChange={setTerm} onSubmit={handleSearch} />
 */
type SearchBarProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (term: string) => void;
  placeholder?: string;
  loading?: boolean;
};

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Busque por peça, marca ou brechó…',
  loading = false,
}: SearchBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    onSubmit(value);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-stretch w-full rounded-none border border-linha bg-branco-quente overflow-hidden"
    >
      <span className="flex items-center pl-3 text-texto-auxiliar" aria-hidden="true">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </span>

      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Enviar Busca"
        className="flex-1 bg-transparent px-2 py-2 font-ui text-body text-tinta placeholder:text-texto-auxiliar outline-none focus:outline-none focus:ring-1 focus:ring-tinta focus:border-tinta"
      />

      <button
        type="submit"
        disabled={loading}
        aria-label="Enviar Busca"
        className={clsx(
          'flex items-center justify-center px-4 bg-verde-rs text-branco-quente',
          loading && 'opacity-70 cursor-not-allowed',
        )}
      >
        {loading ? (
          <svg
            className="animate-spin"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-9-9" />
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        )}
      </button>
    </form>
  );
}
