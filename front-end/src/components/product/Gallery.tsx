import { useState } from 'react';
import clsx from 'clsx';
import IconButton from '@/components/common/IconButton';
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

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
      <path d="M8 5v14l11-7Z" />
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
 * `media` por `position` (o back não garante ordem de chegada) e navega por
 * miniaturas ou setas. Sem fotos, cai no mesmo placeholder usado no
 * catálogo (`ProductCard`), sem quebrar o layout.
 *
 * Vídeo (`type: 'video'`) entra na mesma trilha das fotos: vira mídia
 * principal via `<video controls>` quando selecionado, e a miniatura mostra
 * um ícone de play sobre fundo neutro — `ProductMedia` não tem campo de
 * poster no contrato atual.
 *
 * Setas e miniaturas só aparecem quando há mais de um item (não faz sentido
 * navegar com uma peça só). O contador "FOTO X DE Y" acompanha a mídia
 * principal e é `aria-live` para leitor de tela acompanhar a troca.
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
      <div className="aspect-square w-full bg-linha web:aspect-[4/5]">
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
      <div className="relative aspect-square w-full bg-linha web:aspect-[4/5]">
        {active.type === 'image' ? (
          <img
            src={active.url}
            alt={`${productName} — foto ${activeIndex + 1} de ${items.length}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <video
            src={active.url}
            controls
            className="h-full w-full object-cover"
            aria-label={`${productName} — vídeo ${activeIndex + 1} de ${items.length}`}
          />
        )}

        {hasMultiple ? (
          <>
            <div className="absolute left-2 top-1/2 -translate-y-1/2">
              <IconButton
                icon={<ChevronIcon direction="left" />}
                ariaLabel="Foto anterior"
                onClick={() => goTo(activeIndex - 1)}
              />
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <IconButton
                icon={<ChevronIcon direction="right" />}
                ariaLabel="Próxima foto"
                onClick={() => goTo(activeIndex + 1)}
              />
            </div>
            <p
              aria-live="polite"
              className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-tinta/70 px-3 py-1 text-label uppercase tracking-wide text-branco-quente"
            >
              Foto {activeIndex + 1} de {items.length}
            </p>
          </>
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
                'aspect-square w-16 shrink-0 border-2 bg-linha focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta',
                index === activeIndex ? 'border-vermelho-escuro' : 'border-transparent',
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
                <span className="flex h-full w-full items-center justify-center text-texto-auxiliar">
                  <PlayIcon />
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
