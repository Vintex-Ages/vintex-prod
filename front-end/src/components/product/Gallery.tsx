import { useState } from 'react';
import clsx from 'clsx';
import IconButton from '@/components/common/IconButton';
import VideoPlayer from '@/components/product/VideoPlayer';
import type { ProductMedia } from '@/types/product';

export type GalleryProps = {
  media: ProductMedia[];
  productName: string;
};

function PlaceholderIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-16 w-16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16.5 8.5 12l3 3L16 10.5 20 15M4 6h16v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6Z"
      />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'}
      />
    </svg>
  );
}

/**
 * Galeria de mídia da página de detalhe do produto (FE-US012-2). Ordena
 * `media` por `position` (o back não garante ordem de chegada) e navega pelas
 * miniaturas e setas de foco/hover. Sem fotos, cai no mesmo placeholder usado
 * no catálogo (`ProductCard`), sem quebrar o layout.
 *
 * Vídeo (`type: 'video'`) entra na mesma trilha das fotos: vira mídia
 * principal via `VideoPlayer` (FE-US012-3) quando selecionado, e a miniatura
 * identifica a duração; `ProductMedia` não tem campo de poster no contrato
 * atual.
 *
 * A proporção quase quadrada segue o frame de detalhe do Figma; as miniaturas
 * continuam recortando para quadrado.
 *
 * As miniaturas e setas só aparecem quando há mais de um item. O contador
 * acompanha a mídia principal e é `aria-live` para leitor de tela acompanhar
 * a troca.
 *
 * Usage:
 *   import Gallery from '@/components/product/Gallery';
 *   <Gallery media={product.media} productName={product.name} />
 */
function Gallery({ media, productName }: GalleryProps) {
  const items = [...media].sort((a, b) => a.position - b.position);
  const [activeIndex, setActiveIndex] = useState(0);

  if (items.length === 0) {
    return (
      <div className="aspect-[19/20] w-full border border-linha bg-papel-profundo">
        <div
          role="img"
          aria-label={productName}
          className="flex h-full w-full items-center justify-center text-texto-auxiliar"
        >
          <PlaceholderIcon />
        </div>
      </div>
    );
  }

  const active = items[activeIndex];
  const hasMultiple = items.length > 1;

  const goTo = (index: number) => {
    setActiveIndex(((index % items.length) + items.length) % items.length);
  };

  return (
    <div role="group" aria-label={`Galeria de fotos — ${productName}`}>
      <div className="relative aspect-[19/20] w-full border border-linha bg-papel-profundo">
        {active.type === 'image' ? (
          <img
            src={active.url}
            alt={`${productName} — foto ${activeIndex + 1} de ${items.length}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <VideoPlayer
            src={active.url}
            label={`${productName} — vídeo ${activeIndex + 1} de ${items.length}`}
          />
        )}

        <span
          aria-hidden="true"
          className="absolute left-4 top-4 text-body-sm leading-none text-tinta"
        >
          +
        </span>
        {hasMultiple ? (
          <>
            <div className="group absolute left-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100">
              <IconButton
                icon={<ChevronIcon direction="left" />}
                ariaLabel="Foto anterior"
                onClick={() => goTo(activeIndex - 1)}
              />
            </div>
            <div className="group absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100">
              <IconButton
                icon={<ChevronIcon direction="right" />}
                ariaLabel="Próxima foto"
                onClick={() => goTo(activeIndex + 1)}
              />
            </div>
          </>
        ) : null}
        {active.type === 'image' ? (
          <p
            aria-live="polite"
            className="absolute bottom-2 right-2 bg-tinta/75 px-2 py-1 text-[10px] uppercase tracking-wider text-branco-quente"
          >
            <span>
              Foto {activeIndex + 1} de {items.length}
            </span>
            <span aria-hidden="true"> · Vintex Archive</span>
          </p>
        ) : null}
      </div>

      {hasMultiple ? (
        <div className="mt-3 flex gap-3 overflow-x-auto">
          {items.map((item, index) => (
            <button
              key={`${item.position}-${item.url}`}
              type="button"
              onClick={() => goTo(index)}
              aria-current={index === activeIndex}
              aria-label={
                item.type === 'video'
                  ? `Ver vídeo ${index + 1} de ${items.length}`
                  : `Ver foto ${index + 1} de ${items.length}`
              }
              className={clsx(
                'aspect-square w-28 shrink-0 overflow-hidden bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta',
                index === activeIndex ? 'border-2 border-vermelho-escuro' : 'border border-linha',
              )}
            >
              {item.type === 'image' ? (
                <img
                  src={item.url}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center border border-dashed border-linha text-label text-texto-auxiliar">
                  <span aria-hidden="true">🎥 </span>Vídeo 3s
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default Gallery;
