import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import type { Product, ProductDetail } from '@/types/product';

export type ProductCardProps = {
  /** Campos do feed, com categoria, tamanho e conservação opcionais. */
  product: Product & Partial<Pick<ProductDetail, 'category' | 'condition' | 'size'>>;
  onOpen: (id: string) => void;
  /**
   * Rota real do produto, usada como `to` do `<Link>` do título. Enquanto a
   * FE-US da rota de produto não existir, quem chama pode omitir: o link
   * renderiza com o placeholder `'#'` e a navegação fica 100% a cargo de
   * `onOpen`. Passe o path real assim que a rota existir.
   */
  productPath?: string;
  favoriteSlot?: ReactNode;
};

/** Placeholder de destino do link enquanto não há rota de produto (ver JSDoc). */
const PLACEHOLDER_PATH = '#';

const priceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const wholePriceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Cartão de produto do catálogo — apenas apresentação e navegação genérica
 * (`onOpen`). Sem busca de dados, sem validação de fluxo: quem chama decide o
 * que `onOpen`/`favoriteSlot` significam na tela onde o cartão é usado.
 *
 * Modelo de interação (decisões de review):
 * - O cartão navega, então o elemento interativo é um **link real**, não um
 *   `role="button"`. O wrapper do cartão NÃO é interativo (sem role, tabIndex,
 *   onClick nem onKeyDown); quem recebe foco/teclado é o `<Link>` do título.
 * - `to` do `<Link>` vem da prop `productPath`. Quando é o placeholder `'#'`, o
 *   `onClick` chama `event.preventDefault()` para não sujar a URL — a navegação
 *   real acontece dentro de `onOpen`. Com `productPath` real, o `<Link>` navega
 *   nativamente e `onOpen` ainda é chamado (ex.: telemetria).
 * - "Link esticado": o `<Link>` tem um `::after` com `position: absolute` e
 *   `inset-0`, cobrindo visualmente todo o cartão (o wrapper é `relative`),
 *   mas estruturalmente continua sendo só um link no DOM. O `favoriteSlot` é
 *   **irmão** do link (não descendente), com `z-10` para ficar clicável por
 *   cima do link esticado.
 * - Cantos retos: o design system usa cantos retos nas superfícies (cartão,
 *   campo, botão) e pílula só em selo e chip.
 *
 * Decisões da revisão visual:
 *
 * - **O preço é a âncora.** Ele fica maior que os metadados e divide a base do
 *   cartão com tamanho e conservação quando estão disponíveis.
 * - **Os preços de uma linha da grade se alinham entre si.** O bloco de texto é
 *   `flex-1` e o preço tem `mt-auto`: como o CSS grid iguala a altura dos itens
 *   de uma mesma linha, o preço encosta na base e todos ficam na mesma altura.
 *   Antes, um nome de brechó que quebrava em duas linhas empurrava só aquele
 *   preço para baixo, e a fileira ficava serrilhada.
 * - **O nome é limitado a duas linhas** (`line-clamp-2`), e o brechó a uma
 *   (`truncate`): sem isso um título longo reescrevia a altura do cartão.
 * - A área de foto segue a proporção horizontal do Figma; a imagem continua
 *   dinâmica e vem do produto.
 * - Tamanho e conservação aparecem juntos no rodapé quando os dados existem
 *   (a listagem atual não fornece esses campos).
 *
 * Usage:
 *   import ProductCard from '@/components/product/ProductCard';
 *   <ProductCard
 *     product={product}
 *     onOpen={(id) => navigate(`/product/${id}`)}
 *     favoriteSlot={<FavoriteButton active={fav} onToggle={toggle} />}
 *   />
 */
function ProductCard({
  product,
  onOpen,
  productPath = PLACEHOLDER_PATH,
  favoriteSlot,
}: ProductCardProps) {
  const details = [product.size, product.condition].filter(Boolean).join(' · ');
  const handleOpen = (event: MouseEvent<HTMLAnchorElement>) => {
    if (productPath === PLACEHOLDER_PATH) {
      event.preventDefault();
    }
    onOpen(product.id);
  };

  return (
    <div className="group relative flex flex-col overflow-hidden border border-linha bg-papel shadow-[0_4px_6px_rgba(29,27,26,0.1)] transition-colors hover:border-texto-auxiliar">
      <div className="aspect-[168/146] w-full shrink-0 overflow-hidden bg-papel-profundo p-2">
        <div className="h-full w-full overflow-hidden border border-dashed border-tinta/25">
          {product.coverImageUrl ? (
            <img
              src={product.coverImageUrl}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
            />
          ) : (
            <ProductImagePlaceholder productName={product.name} />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 bg-papel p-2">
        {product.category && (
          <span className="block w-full whitespace-nowrap font-ui text-[8px] font-bold uppercase leading-normal tracking-[0.3px] text-vermelho-escuro">
            {product.category}
          </span>
        )}

        <p className="min-h-[34px] font-display text-[16px] leading-[1.05]">
          <Link
            to={productPath}
            onClick={handleOpen}
            className="line-clamp-2 text-tinta no-underline after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            {product.name}
          </Link>
        </p>

        <p className="truncate font-ui text-[8px] leading-normal text-texto-auxiliar">
          {product.store.name}
          {product.store.city ? ` - ${product.store.city}` : null}
        </p>

        <div className="mt-auto flex w-full items-end justify-between gap-2 border-t border-linha pt-2">
          <p className="font-ui text-[16px] font-bold leading-normal text-tinta">
            {Number.isInteger(product.price)
              ? wholePriceFormatter.format(product.price)
              : priceFormatter.format(product.price)}
          </p>
          {details ? (
            <p className="max-w-[50%] truncate text-right font-ui text-[10px] leading-normal text-texto-auxiliar">
              {details}
            </p>
          ) : null}
        </div>
      </div>

      {favoriteSlot ? <div className="absolute right-2 top-2 z-10">{favoriteSlot}</div> : null}
    </div>
  );
}

export default ProductCard;
