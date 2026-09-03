type FavoriteButtonProps = {
  active: boolean;
  onToggle: () => void;
  ariaLabel?: string;
};

export function FavoriteButton({ active, onToggle, ariaLabel }: FavoriteButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={ariaLabel ?? (active ? 'Remover dos favoritos' : 'Adicionar aos favoritos')}
      className="inline-flex items-center justify-center p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={active ? 'h-6 w-6 text-vermelho-escuro' : 'h-6 w-6 text-tinta'}
      >
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={active ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={active ? 0 : 2}
          strokeLinejoin="round"
          transform="translate(12 12) scale(0.72) translate(-12 -12)"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </button>
  );
}
