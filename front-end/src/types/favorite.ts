import type { Product, ProductStatus } from '@/types/product';

/**
 * Peça na lista de favoritos (FE-SVC-favorites, #316): o item do feed com o
 * `status`. Peça Vendida ou Reservada continua na lista, e a tela mostra o
 * estado pelo `status` (RN-44, back-end#252).
 */
export interface FavoriteProduct extends Product {
  status: ProductStatus;
}
