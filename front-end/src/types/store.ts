/**
 * Contrato de dados da loja do vendedor (FE-SVC-store). Único ponto de
 * verdade para o shape de `StoreProfile` e do que é necessário para criar uma
 * loja — quem precisar desses tipos importa daqui, não redefine local.
 */

export type StoreVerification = 'pendente' | 'confiavel';

export interface StoreMetrics {
  activeProducts: number;
  soldProducts: number;
  monthsOnPlatform: number;
  /** RN-74 — só existem quando o back tiver dado suficiente; opcionais de propósito. */
  shippingWithoutComplaintRate?: number;
  rating?: number;
}

export interface StoreProfile {
  id: string;
  name: string;
  description: string;
  logoUrl: string | null;
  city: string;
  state: string;
  verification: StoreVerification;
  createdAt: string;
  metrics?: StoreMetrics;
}

export interface StoreAddress {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
}

export interface StoreDocument {
  type: 'cpf' | 'cnpj';
  number: string;
}

export interface StoreInput {
  name: string;
  description: string;
  logo?: File | null;
  document: StoreDocument;
  address: StoreAddress;
  pixKey: string;
  /** VS-003b (Should) — opcional até esse fluxo existir. */
  acceptedContractVersion?: string;
}
