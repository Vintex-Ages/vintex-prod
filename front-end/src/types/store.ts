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

/**
 * Resumo da loja na listagem "Brechós do RS" (FE-CMP-38, FE-SVC-store-search).
 * `activeCount` = peças `ativo` (back-end#256). Loja sem endereço vem com
 * `city` e `state` vazios, como no `StoreProfile`.
 */
export interface StoreSummary {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  city: string;
  state: string;
  verified: boolean;
  activeCount: number;
}

/**
 * A própria loja como o dono vê, para a tela de edição (FE-US006-4, #335):
 * inclui o que não sai no perfil público (documento, chave Pix, endereço
 * completo). `address` é `null` em loja criada sem endereço.
 */
export interface MyStoreDetails {
  id: string;
  name: string;
  description: string;
  logoUrl: string | null;
  pixKey: string;
  document: StoreDocument;
  address: StoreAddress | null;
}

/**
 * Envio parcial da edição (back-end#221): campo ausente não muda. O documento
 * não está aqui de propósito: não é alterável por esta rota.
 */
export interface StoreUpdate {
  name?: string;
  description?: string;
  /** Logo nova; `null` tira a logo. */
  logo?: File | null;
  address?: StoreAddress;
  pixKey?: string;
}
