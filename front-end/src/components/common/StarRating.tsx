import { useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';
import clsx from 'clsx';

export type StarRatingProps =
  | {
      mode: 'select';
      /** Nota atual. Sem ele, o componente guarda a última nota escolhida. */
      value?: number;
      onChange: (score: number) => void;
      /** Nome do grupo para leitores de tela. */
      ariaLabel?: string;
    }
  | {
      mode: 'display';
      average: number;
      count?: number;
    };

const MAX_SCORE = 5;
const SCORES = [1, 2, 3, 4, 5];

const averageFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function Star({ filled, className }: { filled: boolean; className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55-4.76-4.64 6.58-.96L12 2.5z"
        className={clsx('stroke-texto-auxiliar', filled ? 'fill-dourado' : 'fill-none')}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getArrowDirection(key: string): number {
  if (key === 'ArrowRight' || key === 'ArrowDown') return 1;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return -1;
  return 0;
}

function SelectStars({
  value,
  onChange,
  ariaLabel = 'Escolha uma nota',
}: Extract<StarRatingProps, { mode: 'select' }>) {
  const [chosen, setChosen] = useState<number | null>(null);
  // Estrela em que as setas pararam: pinta a prévia, mas só vira nota no Enter/Espaço.
  const [preview, setPreview] = useState<number | null>(null);
  const starRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const current = value !== undefined ? value : chosen;
  const selected = current !== null && SCORES.includes(current) ? current : null;
  const shown = preview ?? selected ?? 0;
  const tabStop = preview ?? selected ?? 1;

  // Enter e Espaço não precisam de handler: em <button> eles já disparam o clique.
  function handleSelect(score: number) {
    setPreview(null);
    setChosen(score);
    onChange(score);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, score: number) {
    const direction = getArrowDirection(event.key);
    if (direction === 0) return;

    event.preventDefault();
    const next = ((score - 1 + direction + MAX_SCORE) % MAX_SCORE) + 1;
    setPreview(next);
    starRefs.current[next - 1]?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setPreview(null);
    }
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} onBlur={handleBlur} className="inline-flex">
      {SCORES.map((score) => (
        <button
          key={score}
          ref={(element) => {
            starRefs.current[score - 1] = element;
          }}
          type="button"
          role="radio"
          aria-checked={score === selected}
          aria-label={`${score} de ${MAX_SCORE} estrelas`}
          tabIndex={score === tabStop ? 0 : -1}
          onClick={() => handleSelect(score)}
          onKeyDown={(event) => handleKeyDown(event, score)}
          className="inline-flex min-h-touch min-w-touch items-center justify-center transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
        >
          <Star filled={score <= shown} className="h-6 w-6" />
        </button>
      ))}
    </div>
  );
}

function formatCount(count: number | undefined): string | null {
  if (count === undefined || !Number.isInteger(count) || count < 0) return null;
  return count === 1 ? '1 avaliação' : `${count} avaliações`;
}

function DisplayStars({
  average,
  count,
}: Pick<Extract<StarRatingProps, { mode: 'display' }>, 'average' | 'count'>) {
  const hasAverage = Number.isFinite(average);
  const clamped = hasAverage ? Math.min(Math.max(average, 0), MAX_SCORE) : 0;
  const averageText = hasAverage ? averageFormatter.format(clamped) : null;
  const countText = formatCount(count);
  const filledStars = Math.round(clamped);

  const label = [
    averageText ? `Média ${averageText} de ${MAX_SCORE} estrelas` : 'Média indisponível',
    countText,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <span role="img" aria-label={label} className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex">
        {SCORES.map((score) => (
          <Star key={score} filled={score <= filledStars} className="h-4 w-4" />
        ))}
      </span>
      {averageText ? (
        <span className="text-body-sm font-semibold text-tinta">{averageText}</span>
      ) : null}
      {countText ? <span className="text-body-sm text-texto-auxiliar">{countText}</span> : null}
    </span>
  );
}

/**
 * Estrelas de avaliação — apenas apresentação: não conhece service nem regra de
 * quem pode avaliar. Só estrelas, sem campo de texto em nenhum modo (RN-75).
 *
 * `select`: nota de 1 a 5 como radiogroup. O clique escolhe na hora; no teclado
 * as setas movem e pré-visualizam, e Enter ou Espaço confirmam, então `onChange`
 * dispara uma vez por escolha mesmo que quem chama já salve a nota nele.
 *
 * `display`: média com uma casa em pt-BR e contagem opcional, sem interação.
 * A média é limitada a 0..5 e, se não for um número finito, não é mostrada. As
 * estrelas pintadas seguem a média arredondada (4,3 pinta 4).
 *
 * Usage:
 *   import StarRating from '@/components/common/StarRating';
 *   <StarRating mode="select" value={nota} onChange={setNota} />
 *   <StarRating mode="display" average={4.3} count={12} />
 */
function StarRating(props: StarRatingProps) {
  if (props.mode === 'select') {
    return <SelectStars {...props} />;
  }

  return <DisplayStars average={props.average} count={props.count} />;
}

export default StarRating;
