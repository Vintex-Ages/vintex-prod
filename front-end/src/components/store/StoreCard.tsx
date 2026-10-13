import Avatar from '@/components/common/Avatar';
import VerifiedBadge from '@/components/common/VerifiedBadge';
import ProductImagePlaceholder from '@/components/product/ProductImagePlaceholder';
import type { Product } from '@/types/product';
import { formatPieceCount } from '@/utils/format';

/** Resumo da loja para a listagem "Brechós do RS". `activeCount` = peças ativas. */
export type StoreSummary = {
  id: string;
  name: string;
  logoUrl: string | null;
  city: string;
  state: string;
  verified: boolean;
  activeCount: number;
};

export type StoreCardProps = {
  store: StoreSummary;
  /** Até 2 peças; o que passar disso é ignorado. */
  preview?: Product[];
  onOpen: (storeId: string) => void;
};

const MAX_PREVIEW = 2;

const priceFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const wholePriceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatPrice(price: number): string {
  return Number.isInteger(price) ? wholePriceFormatter.format(price) : priceFormatter.format(price);
}

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="currentColor"
      className="hidden shrink-0 text-vermelho-escuro tablet:block"
    >
      <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
    </svg>
  );
}

/**
 * Cartão de um brechó na página "Brechós do RS" (FE-CMP-38): logo, nome,
 * cidade/UF, selo Confiável, peças ativas e uma prévia de até 2 peças com o
 * link "Ver +N peças". Só apresentação: o cartão inteiro chama `onOpen` com o
 * id da loja (quem navega é a página). Fora do escopo, por decisão da issue:
 * nota, "Seguir" e distância.
 *
 * Usage:
 *   import StoreCard from '@/components/store/StoreCard';
 *   <StoreCard store={loja} preview={pecas} onOpen={(id) => navigate(storeProfile(id))} />
 */
function StoreCard({ store, preview = [], onOpen }: StoreCardProps) {
  const shown = preview.slice(0, MAX_PREVIEW);
  const remaining = store.activeCount - shown.length;
  const showMore = shown.length > 0 && remaining > 0;

  return (
    <article className="relative flex flex-col border border-linha bg-branco-quente transition-colors hover:border-texto-auxiliar">
      <div className="flex items-start gap-3 p-4">
        <Avatar name={store.name} src={store.logoUrl} size="lg" />

        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-display text-h4 text-tinta">
            {/* Link esticado: o cartão todo é clicável, como no `ProductCard`. */}
            <button
              type="button"
              onClick={() => onOpen(store.id)}
              className="text-left after:absolute after:inset-0 after:content-[''] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-tinta"
            >
              {store.name}
            </button>
          </h3>

          <p className="flex items-center gap-1 font-ui text-label text-texto-auxiliar">
            <PinIcon />
            <span>
              {store.city} • {store.state}
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <VerifiedBadge verified={store.verified} label="Confiável" />
            <span className="font-ui text-label text-texto-auxiliar">
              {formatPieceCount(store.activeCount)} {store.activeCount === 1 ? 'ativa' : 'ativas'}
            </span>
          </div>
        </div>
      </div>

      {shown.length > 0 ? (
        <div className="grid grid-cols-3 gap-px border-t border-linha bg-linha">
          {shown.map((product) => (
            <div
              key={product.id}
              className="relative aspect-square overflow-hidden bg-papel-profundo"
            >
              {product.coverImageUrl ? (
                <img
                  src={product.coverImageUrl}
                  alt={product.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <ProductImagePlaceholder productName={product.name} />
              )}
              <span className="absolute bottom-0 right-0 bg-tinta px-1.5 py-0.5 font-ui text-label font-bold text-branco-quente">
                {formatPrice(product.price)}
              </span>
            </div>
          ))}

          {showMore ? (
            <div className="flex aspect-square items-center justify-center bg-papel-profundo p-2 text-center font-ui text-label font-semibold text-tinta">
              <span>Ver +{formatPieceCount(remaining)}</span>
              <span aria-hidden="true" className="ml-1">
                →
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default StoreCard;
