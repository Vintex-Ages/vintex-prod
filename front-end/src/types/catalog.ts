/**
 * Filtros disponíveis para consulta do catálogo.
 * Os nomes aqui seguem a convenção do frontend.
 * A conversão para os nomes esperados pela API é feita no catalogService.
 */
export type CatalogFilters = {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  size?: string[];
  brand?: string[];
  condition?: string[];
  color?: string[];
  city?: string;
  state?: string;
};

/**
 * Produto retornado no feed do catálogo.
 * Contrato baseado em GET /api/products.
 */
export type CatalogProduct = {
  id: number;
  name: string;
  price: number;
  cover_image_url: string | null;
  store: {
    id: number;
    name: string;
  };
  status: string;
};

/**
 * Filtros aplicados devolvidos pelo backend.
 * Os campos são opcionais porque a resposta pode conter apenas
 * os filtros efetivamente utilizados na consulta.
 */
export type AppliedFilters = {
  category?: string;
  price_min?: number;
  price_max?: number;
  size?: string;
  brand?: string;
  condition?: string;
  color?: string;
  city?: string;
  state?: string;
};

/**
 * Resposta do endpoint de catálogo.
 */
export type CatalogFeedResponse = {
  items: CatalogProduct[];
  page: number;
  page_size: number;
  total: number;
  applied_filters?: AppliedFilters;
};
