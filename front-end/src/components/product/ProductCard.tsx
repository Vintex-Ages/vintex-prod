import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import type { Product, ProductDetail } from '@/types/product';

export type ProductCardProps = {
  /** Campos do feed, com categoria e conservação opcionais. */
  product: Product & Partial<Pick<ProductDetail, 'category' | 'condition'>>;
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
 * - **O preço é a âncora.** Era `text-body font-semibold`, o mesmo tamanho do
 *   nome da peça, no meio de cinco linhas de texto empilhadas com o mesmo peso.
 *   Numa grade de compra o preço é o dado que decide, então sobe para `h4` e
 *   fica sozinho na base do cartão.
 * - **Os preços de uma linha da grade se alinham entre si.** O bloco de texto é
 *   `flex-1` e o preço tem `mt-auto`: como o CSS grid iguala a altura dos itens
 *   de uma mesma linha, o preço encosta na base e todos ficam na mesma altura.
 *   Antes, um nome de brechó que quebrava em duas linhas empurrava só aquele
 *   preço para baixo, e a fileira ficava serrilhada.
 * - **O nome é limitado a duas linhas** (`line-clamp-2`), e o brechó a uma
 *   (`truncate`): sem isso um título longo reescrevia a altura do cartão.
 * - **A foto é 3:4, não quadrada** — é a proporção em que as peças chegam
 *   (600×800), então some o corte que cortava barra e gola.
 * - **`condition` sai do cartão.** Era a quinta linha de texto, em cinza
 *   pequeno, e repetia o que a ficha da peça já diz. A prop continua aceita
 *   para não quebrar quem passa, só não é mais desenhada aqui.
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
  const handleOpen = (event: MouseEvent<HTMLAnchorElement>) => {
    if (productPath === PLACEHOLDER_PATH) {
      event.preventDefault();
    }
    onOpen(product.id);
  };

  return (
    <div className="group relative flex flex-col overflow-hidden border border-linha bg-branco-quente transition-colors hover:border-texto-auxiliar">
      <div className="aspect-[3/4] w-full shrink-0 overflow-hidden bg-linha">
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

      <div className="flex flex-1 flex-col gap-1 p-3">
        {product.category && (
          <span className="text-label text-texto-auxiliar">{product.category}</span>
        )}

        <p className="text-body font-medium leading-snug">
          <Link
            to={productPath}
            onClick={handleOpen}
            className="line-clamp-2 text-tinta no-underline after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            {product.name}
          </Link>
        </p>

        <p className="truncate text-label text-texto-auxiliar">
          {product.store.name}
          {product.store.city ? ` · ${product.store.city}` : null}
        </p>

        <p className="mt-auto pt-2 text-h4 font-bold text-tinta">
          {priceFormatter.format(product.price)}
        </p>
      </div>

      {favoriteSlot ? <div className="absolute right-2 top-2 z-10">{favoriteSlot}</div> : null}
    </div>
  );
}

export default ProductCard;
