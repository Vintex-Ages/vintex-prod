/**
 * Contrato de dados do catálogo (FE-SVC-catalog). Único ponto de verdade para
 * o shape de produto consumido por home, filtros, busca e detalhe — quem
 * precisar de `Product`/`ProductDetail` importa daqui, não redefine local.
 */

import type { StoreVerification } from '@/types/store';

/**
 * Status da peça com os mesmos valores do JSON do back (decidido na
 * back-end#144) — é o que vai no corpo e no `?status=`. Os rótulos da tela
 * (`Anunciada`, `Já vendida`, `Pausada`) ficam só no `StatusBadge`.
 */
export type ProductStatus = 'rascunho' | 'ativo' | 'vendido' | 'despublicado';

export interface Store {
  id: string;
  name: string;
  city?: string;
  /**
   * Forma derivada/legada de verificação (`verification === 'confiavel'`).
   * Mantido porque `catalogService.ts` e `mocks/products.ts` ainda o
   * preenchem; código novo deveria preferir `verification` quando disponível.
   */
  verified?: boolean;
  /** URL do logo da loja. Usado no card da loja da página de detalhe (FE-US012-1). */
  logoUrl?: string;
  /** Verificação da loja (FE-SVC-store), ver `@/types/store`. */
  verification?: StoreVerification;
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
 * pode devolver, confirmado pelo contrato do back — rascunho nunca é público. Uma peça `despublicado`
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
  status: Exclude<ProductStatus, 'rascunho'>;
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

// ---- Peças do vendedor (FE-SVC-seller-products, #202) ----

/**
 * CONTRATO PROVISÓRIO RN-92: schema da peça como insumo da IA (RN-49 + RN-92).
 * Espelha `ProductDraftCreate` do back (back-end#159). Campos a confirmar:
 * - `price`: o Pydantic v2 serializa `Decimal` como string (`"129.90"`); o
 *   service converte pra `number`. Em reais, 2 casas — nunca centavos.
 * - `images`: o back guarda `image_url` + `position`; no JSON vai só a lista de
 *   URLs, e a posição é o índice. Sem `id` nem `type` (comentário do back na #202).
 * - `style`: string única no back, não lista.
 */
export interface ProductInput {
  name: string;
  description?: string;
  category?: string;
  size?: string;
  color?: string;
  brand?: string;
  condition?: string;
  style?: string;
  price: number;
  /** URLs na ordem de exibição; ≥ 1 para publicar (RN-47). */
  images: string[];
  /** RN-46 — literal: o back fixa em 1 e nem recebe o campo. */
  quantity: 1;
}

/** Correção do vendedor sobre uma sugestão da IA (back: `ai_corrections[]`). */
export interface ListingCorrection {
  field: keyof ProductInput;
  suggested: string | null;
  final: string;
}

/**
 * Item de `GET /users/me/products` (`ProductManagementResponse`, back-end#157):
 * a listagem não traz `images` nem `store`.
 */
export interface SellerProduct {
  id: string;
  name: string;
  price: number;
  status: ProductStatus;
  description?: string;
  category?: string;
  size?: string;
  color?: string;
  brand?: string;
  condition?: string;
  style?: string;
}

/** Peça completa do vendedor (`ProductDraftResponse`, back-end#159), em qualquer status. */
export interface SellerProductDetail extends SellerProduct, ProductInput {
  store: { id: string; name: string; city: string | null };
  aiCorrections: ListingCorrection[];
}

/** Resumo financeiro do período (RN-51.1, back-end#146 — sem implementação no back ainda). Em reais. */
export interface SalesSummary {
  period: 'month' | '30d' | 'all';
  soldCount: number;
  gross: number;
  commission: number;
  net: number;
}
