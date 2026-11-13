import type { Product, ProductStatus } from '@/types/product';

/** Metadados opcionais até a integração definitiva do contrato de back-end#327. */
export interface ModerationMetadata {
  moderationReason?: string;
  /** String recebida da API, sem conversão de fuso ou acréscimo de timezone. */
  moderatedAt?: string;
}

/** Resultado parcial dos POSTs: não contém os campos de um produto completo. */
export interface ModerationResult extends ModerationMetadata {
  productId: string;
  status: ProductStatus;
}

/** Item da listagem administrativa; os campos de Product existem no schema do PR #59. */
export interface SuspendedProduct extends Product, ModerationMetadata {
  status: ProductStatus;
  moderatedBy?: { id: string; name: string };
}

/** Paginação provisória do PR #59; pageSize é enviado como page_size. */
export interface ListSuspendedParams {
  page?: number;
  pageSize?: number;
}
