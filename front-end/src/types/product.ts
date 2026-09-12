/**
 * Contrato de dados do catálogo (FE-SVC-catalog). Único ponto de verdade para
 * o shape de produto consumido por home, filtros, busca e detalhe — quem
 * precisar de `Product`/`ProductDetail` importa daqui, não redefine local.
 */

export interface Store {
  id: string;
  name: string;
  city?: string;
  verified?: boolean;
  /** URL do logo da loja. Usado no card da loja da página de detalhe (FE-US012-1). */
  logoUrl?: string;
}

/**
 * Item de listagem (feed, filtros, busca). Sem `condition`: o back só devolve
 * esse campo no detalhe (`ProductDetail`), não no item de lista.
 */
export interface Product {
  id: string;
  name: string;
  price: number;
  coverImageUrl: string | null;
  store: Store;
}

export interface ProductMedia {
  type: 'image' | 'video';
  url: string;
  position: number;
}

/**
 * `status` tem os 3 valores que o endpoint de detalhe (`GET /api/products/{id}`)
 * pode devolver, confirmado pelo contrato do back. Uma peça `despublicado`
 * nunca aparece no feed/filtros (`Product` da listagem), mas o detalhe pode
 * retorná-la — como a tela reage a isso é decisão de FE-US012-1, não daqui.
 */
export interface ProductDetail extends Product {
  category: string;
  size: string;
  color: string;
  brand: string;
  condition: string;
  description: string;
  status: 'ativo' | 'vendido' | 'despublicado';
  media: ProductMedia[];
  /**
   * Material e medidas da peça — PLACEHOLDER (FE-US012-1): pedidos no Figma
   * mas sem contrato confirmado no back ainda. Opcionais de propósito; a
   * tela de detalhe esconde a linha do atributo quando ausente.
   */
  material?: string;
  measurements?: string;
}

/**
 * `pageSize` fica camelCase aqui mesmo que a API real use `page_size` — a
 * conversão é responsabilidade do service, não desta camada de contrato.
 */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface FilterParams {
  category?: string;
  priceMin?: number;
  priceMax?: number;
  size?: string;
  brand?: string;
  condition?: string;
  color?: string;
  city?: string;
  state?: string;
  q?: string;
  sort?: 'recent';
}

export interface SearchResult {
  match_type: 'exact' | 'fallback';
  items: Product[];
  suggestions?: { reason: string; items: Product[] };
  total: number;
}
