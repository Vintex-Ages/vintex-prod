import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * TEMPORARY type — ainda não existe um contrato `Product` compartilhado em
 * `src/types` (a task FE-SVC-catalog, responsável por criá-lo, não foi
 * implementada). Quando ela existir, substitua este type pelo oficial e
 * remova esta definição local.
 *
 * `category` é `string` (não `string[]`) porque o design mostra apenas uma
 * categoria por cartão; revise este campo junto com o type oficial caso o
 * catálogo passe a suportar múltiplas categorias por produto.
 */
export type Product = {
  id: string;
  title: string;
  category: string;
  storeName: string;
  city: string;
  price: number;
  coverImageUrl?: string | null;
  condition: string;
};

export type ProductCardProps = {
  product: Product;
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
 * - `to` do `<Link>` vem da prop `productPath`. A rota de produto ainda não
 *   existe no projeto (não há FE-US pronta), então o default é o placeholder
 *   `'#'`. Quando `productPath` é o placeholder, o `onClick` chama
 *   `event.preventDefault()` para não sujar a URL — a navegação real acontece
 *   dentro de `onOpen`, que continua sendo o ponto de extensão genérico (quem
 *   usa o componente decide para onde vai). Passando um `productPath` real, o
 *   `<Link>` navega nativamente e `onOpen` ainda é chamado (ex.: telemetria).
 * - "Link esticado": o `<Link>` tem um `::after` com `position: absolute` e
 *   `inset-0`, cobrindo visualmente todo o cartão (o wrapper é `relative`),
 *   mas estruturalmente continua sendo só um link no DOM. O `favoriteSlot` é
 *   **irmão** do link (não descendente), com `z-10` para ficar clicável por
 *   cima do link esticado — por isso não é mais necessário `stopPropagation`.
 * - Cantos retos (`rounded-none`): o design system usa cantos retos nos demais
 *   componentes e não há confirmação de arredondamento no Figma (node
 *   717:19161) para este cartão.
 *
 * Usage:
 *   import ProductCard from '@/components/product/ProductCard';
 *   <ProductCard
 *     product={product}
 *     onOpen={(id) => navigate(`/produto/${id}`)}
 *     favoriteSlot={<FavoriteButton productId={product.id} />}
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
    <div className="relative flex flex-col overflow-hidden rounded-none border border-linha bg-branco-quente">
      <div className="aspect-square w-full shrink-0 bg-linha">
        {product.coverImageUrl ? (
          <img
            src={product.coverImageUrl}
            alt={product.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            role="img"
            aria-label={product.title}
            className="flex h-full w-full items-center justify-center text-texto-auxiliar"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-10 w-10"
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
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 p-3">
        <span className="text-label uppercase tracking-wide text-texto-auxiliar">
          {product.category}
        </span>
        <p className="text-body font-medium">
          <Link
            to={productPath}
            onClick={handleOpen}
            className="text-tinta no-underline after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            {product.title}
          </Link>
        </p>
        <p className="text-label text-texto-auxiliar">
          {product.storeName} · {product.city}
        </p>
        <p className="text-body font-semibold text-tinta">{priceFormatter.format(product.price)}</p>
        <p className="text-label text-texto-auxiliar">{product.condition}</p>
      </div>

      {favoriteSlot ? <div className="absolute right-2 top-2 z-10">{favoriteSlot}</div> : null}
    </div>
  );
}

export default ProductCard;
