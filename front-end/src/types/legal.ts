/**
 * Contrato dos documentos jurídicos (FE-SVC-legal, issue #203). São dois
 * artefatos distintos (RN-93): os termos de uso, aceitos por todo usuário no
 * cadastro, e o contrato de venda, aceito por quem vira vendedor.
 *
 * Não há `title`: o back não manda (PR back-end#187). A tela monta o título a
 * partir de um mapa fixo `kind` → rótulo ("Termos de uso" / "Contrato de venda").
 */

export type LegalKind = 'terms' | 'seller-contract';

export interface LegalDocument {
  kind: LegalKind;
  /** Versão que a tela devolve no aceite (`acceptedTermsVersion`/`acceptedContractVersion`). */
  version: string;
  publishedAt: string;
  content: string;
}
