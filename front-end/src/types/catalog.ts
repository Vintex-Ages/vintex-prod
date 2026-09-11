/**
 * Filtros disponíveis para consulta do catálogo.
 * Os campos preenchidos são enviados pelo catalogService como query params.
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
 * Contrato mínimo de produto utilizado pelo catálogo.
 * Deve ser alinhado ao contrato oficial quando a FE-SVC-catalog (#76)
 * estiver disponível.
 */
export type CatalogProduct = {
  id: string;
  title: string;
  category: string;
  storeName: string;
  city: string;
  price: number;
  coverImageUrl?: string | null;
  condition: string;
};
