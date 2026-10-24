import { type ChangeEvent, type FormEvent } from 'react';
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
 * - **Exceção: `submitVariant="arrow"`.** O Figma da área admin (fila de
 *   comprovantes, FE-US032-1) desenha o botão como um quadrado verde só com a
 *   seta. Existe só para essa tela: o padrão (`text`) segue como acima, e o
 *   botão continua com o nome acessível "Buscar".
 *
 * - **Busca por foto (FE-US031-1, RN-60): `onImageSelect`.** Quando a tela passa
 *   esse callback, aparece o botão de câmera (um `<label>` com `<input
 *   type="file">`, que abre a câmera no celular e o seletor de arquivos no
 *   desktop). Sem o callback a barra fica exatamente como antes, então as
 *   outras telas que usam o componente não mudam.
 *
 * Uso:
 *   <SearchBar value={term} onChange={setTerm} onSubmit={handleSearch} />
 *   <SearchBar value={term} onChange={setTerm} onSubmit={buscar} submitVariant="arrow" />
 *   <SearchBar value={draft} onChange={setDraft} onSubmit={send} submitLabel="Enviar" />
 *   <SearchBar value={term} onChange={setTerm} onSubmit={buscar} onImageSelect={buscarPorFoto} />
 */
type SearchBarProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (term: string) => void;
  loading?: boolean;
  /**
   * Texto do campo vazio. O default e curto de proposito: a 390px sobram ~24
   * caracteres ao lado do botao, e o texto longo truncava no meio da palavra.
   * Onde ha espaco (a barra do cabecalho, so no desktop) passa-se um maior.
   */
  placeholder?: string;
  /** Verbo do botão. Default "Buscar"; a conversa com a Vintex usa "Enviar". */
  submitLabel?: string;
  /** `sm` encolhe a altura para caber na barra do cabeçalho. */
  size?: 'md' | 'sm';
  /** `arrow`: botão verde quadrado só com a seta (Figma da área admin). Default `text`. */
  submitVariant?: 'text' | 'arrow';
  /**
   * Quando informado, mostra o botão de câmera (busca por imagem, RN-60) e
   * entrega a foto escolhida ou tirada. Sem ele, a barra fica como sempre.
   */
  onImageSelect?: (file: File) => void;
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

function ArrowUpIcon({ className }: { className?: string }) {
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
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
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
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder = 'Busque por peça ou marca',
  loading = false,
  submitLabel = 'Buscar',
  size = 'md',
  submitVariant = 'text',
  onImageSelect,
}: SearchBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    onSubmit(value);
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Limpa o campo: escolher a mesma foto de novo precisa disparar `change`.
    event.target.value = '';
    if (file) onImageSelect?.(file);
  }

  const compact = size === 'sm';
  const arrow = submitVariant === 'arrow';

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className={clsx(
        'flex w-full items-stretch overflow-hidden border border-linha bg-branco-quente',
        'focus-within:border-tinta focus-within:ring-1 focus-within:ring-tinta',
        arrow && 'shadow-sm',
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

      {onImageSelect && (
        <label
          className={clsx(
            'flex shrink-0 cursor-pointer items-center text-texto-auxiliar transition-colors hover:bg-papel-profundo hover:text-tinta',
            'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-tinta',
            compact ? 'px-2' : 'px-3',
          )}
        >
          <span className="sr-only">Buscar por foto</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageChange}
            className="sr-only"
          />
          <CameraIcon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
        </label>
      )}

      <button
        type="submit"
        disabled={loading}
        aria-label={loading ? 'Buscando' : arrow ? submitLabel : undefined}
        className={clsx(
          'relative flex shrink-0 items-center justify-center gap-2 font-semibold text-branco-quente transition',
          'hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-branco-quente',
          'disabled:cursor-not-allowed disabled:opacity-70',
          'min-h-touch',
          arrow
            ? 'w-11 bg-verde-rs'
            : clsx('bg-vermelho-escuro', compact ? 'px-3 text-body-sm' : 'px-4 text-body'),
        )}
      >
        {arrow ? (
          <ArrowUpIcon className={clsx('h-4 w-4', loading && 'invisible')} />
        ) : (
          <span className={loading ? 'invisible' : undefined}>{submitLabel}</span>
        )}
        {loading && (
          <svg
            aria-hidden="true"
            className="absolute h-5 w-5 animate-spin motion-reduce:animate-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-9-9" />
          </svg>
        )}
      </button>
    </form>
  );
}
