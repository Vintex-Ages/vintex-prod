import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import { productDetail } from '@/routes/paths';
import { formatCentsToBRL } from '@/utils/format';
import type { LookPiece, LookSuggestion } from '@/types/look';

/**
 * Seção "Combine e monte o look" (FE-CMP-41, issue #429): as peças que combinam
 * com a peça aberta, com foto, nome, loja e preço de cada uma, e o valor total
 * do conjunto (RN-63). Só apresentação: recebe o `LookSuggestion` pronto (de
 * `getCombinations`, #428) e devolve as ações para a página.
 *
 * - Cada peça leva ao detalhe dela (`productDetail`).
 * - "+ Adicionar" chama `onAdd(pieceId)`: quem põe na sacola é a página.
 * - `matchType === 'fallback'` troca a linha de apoio por um aviso de que são
 *   alternativas próximas (RN-61).
 * - Sem peças, não renderiza nada, nem o título.
 * - A loja de cada peça aparece: peças de lojas diferentes viram Pedidos
 *   diferentes. Nada é inventado: a seção mostra o que vier (RN-65).
 *
 * Visual do bloco "Curadoria da IA Vintex" do Figma (Detalhes Produto T02,
 * mobile `476:765` e web `171:4953`); o Figma não traz o total, que a RN-63 exige.
 *
 * Layout: acompanha a LARGURA DA SEÇÃO, não a da janela. A seção do frame web é
 * uma coluna de 536px e a do mobile, de 361px; em janela de tablet, por
 * exemplo, a coluna pode ser estreita ou larga. Por isso a largura é medida
 * (`ResizeObserver`): a partir de `WIDE_MIN_WIDTH` o cartão vira linha (foto de
 * 55px, preço ao lado da loja, botão compacto); abaixo, empilha (foto de
 * 143×93, botão de largura total).
 *
 * Usage:
 *   import { LookSuggestions } from '@/components/vintex-ai';
 *   <LookSuggestions
 *     suggestion={look}
 *     title="Combine esta jaqueta e monte o look"
 *     onAdd={(pieceId) => addToCart(pieceId)}
 *   />
 */
export interface LookSuggestionsProps {
  suggestion: LookSuggestion;
  /** Chamado ao clicar em "+ Adicionar" de uma peça. */
  onAdd: (pieceId: string) => void;
  /**
   * Título da seção. A página, que conhece a peça aberta, diz o nome dela do jeito
   * certo (ex.: "Combine esta jaqueta e monte o look"); o artigo concorda com o
   * gênero da peça, então o componente não o deduz. Sem ele, usa o título genérico.
   */
  title?: string;
}

const DEFAULT_TITLE = 'Combine esta peça e monte o look';

/** Entre os 361px da seção no mobile e os 536px da web do Figma. */
const WIDE_MIN_WIDTH = 480;

function brl(reais: number): string {
  return formatCentsToBRL(Math.round(reais * 100));
}

interface PieceCardProps {
  piece: LookPiece;
  wide: boolean;
  onAdd: (pieceId: string) => void;
}

function PieceCard({ piece, wide, onAdd }: PieceCardProps) {
  return (
    <li
      className={clsx(
        'flex gap-3.5 border border-linha bg-branco-quente',
        wide ? 'flex-row items-center px-3 py-4' : 'flex-col p-4',
      )}
    >
      <Link
        to={productDetail(piece.id)}
        aria-label={`${piece.name}, ${piece.store.name}, ${brl(piece.price)}`}
        className="flex min-w-0 flex-1 items-center gap-3.5 text-tinta no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
      >
        <span
          className={clsx(
            'flex shrink-0 items-center justify-center overflow-hidden border border-linha bg-papel-profundo',
            wide ? 'h-[55px] w-[55px]' : 'h-[93px] w-[143px]',
          )}
        >
          {piece.coverImageUrl ? (
            <img src={piece.coverImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ProductImagePlaceholder productName={piece.name} />
          )}
        </span>
        <span className={clsx('flex min-w-0 flex-1 flex-col', !wide && 'gap-2')}>
          <span
            className={clsx(
              'text-body-sm font-semibold text-tinta',
              wide ? 'leading-[1.5]' : 'leading-[1.15]',
            )}
          >
            {piece.name}
          </span>
          <span className={clsx('flex', wide ? 'flex-row gap-1' : 'flex-col')}>
            <span className="text-label tracking-normal text-texto-auxiliar">
              {piece.store.name}
            </span>
            <span
              className={clsx(
                wide
                  ? 'text-label tracking-normal text-texto-auxiliar'
                  : 'text-body font-bold text-tinta',
              )}
            >
              {wide && <span aria-hidden="true">• + </span>}
              {brl(piece.price)}
            </span>
          </span>
        </span>
      </Link>

      <button
        type="button"
        onClick={() => onAdd(piece.id)}
        className={clsx(
          'inline-flex items-center justify-center border border-tinta bg-tinta text-label font-semibold uppercase text-branco-quente transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-branco-quente',
          wide ? 'min-h-9 px-[0.85rem]' : 'min-h-11 px-3',
        )}
      >
        <span aria-hidden="true">+ </span>Adicionar{' '}
        <span className="sr-only">{piece.name} à sacola</span>
      </button>
    </li>
  );
}

export function LookSuggestions({
  suggestion,
  onAdd,
  title = DEFAULT_TITLE,
}: LookSuggestionsProps) {
  const { pieces, matchType, totalAmount } = suggestion;
  const hasPieces = pieces.length > 0;
  const sectionRef = useRef<HTMLElement>(null);
  const [wide, setWide] = useState(false);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const measure = () => setWide(section.getBoundingClientRect().width >= WIDE_MIN_WIDTH);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    return () => observer.disconnect();
  }, [hasPieces]);

  if (!hasPieces) return null;

  return (
    <section
      ref={sectionRef}
      aria-labelledby="look-suggestions-titulo"
      className="flex flex-col gap-2 border border-linha bg-papel-profundo p-5"
    >
      <p className="text-label font-bold uppercase text-vermelho-escuro">
        <span aria-hidden="true">✨ </span>Curadoria da IA Vintex
      </p>
      <h3 id="look-suggestions-titulo" className="font-display text-h4 text-tinta">
        {title}
      </h3>
      <p className="text-body-sm text-texto-auxiliar">
        {matchType === 'fallback'
          ? 'Não achamos combinações exatas: estas são alternativas próximas.'
          : 'Sugestão harmônica baseada em estilo e textura:'}
      </p>

      <ul className="flex flex-col gap-3">
        {pieces.map((piece) => (
          <PieceCard key={piece.id} piece={piece} wide={wide} onAdd={onAdd} />
        ))}
      </ul>

      <p className="mt-1 flex items-baseline justify-between border-t border-linha pt-3 text-body-sm text-texto-auxiliar">
        <span>Total do conjunto</span>
        <strong className="text-body font-bold text-tinta">{brl(totalAmount)}</strong>
      </p>
    </section>
  );
}

export default LookSuggestions;
