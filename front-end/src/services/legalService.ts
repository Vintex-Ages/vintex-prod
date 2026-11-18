import { httpClient } from '@/services/httpClient';
import { sellerContractDocument, termsDocument } from '@/mocks/legal';
import type { LegalDocument, LegalKind } from '@/types/legal';

/**
 * Service de documentos jurídicos (FE-SVC-legal, issue #203) — só lê os
 * documentos versionados. O aceite não passa por aqui: viaja como campo no
 * `register()` (`acceptedTermsVersion`) e no `createStore()`
 * (`acceptedContractVersion`). Segue o mesmo padrão de `storeService.ts`: flag
 * `VITE_USE_MOCKS`, branch mock vs. API real, erros normalizados em
 * `LegalError`.
 */
const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

/**
 * Erro de documento jurídico com o mesmo `code` do envelope do back
 * (`app/core/errors.py::ErrorCode`, ex.: `LEGAL_DOCUMENT_NOT_FOUND`) — quem
 * chama o service trata o mesmo formato estando no mock ou na API real.
 */
export class LegalError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LegalError';
  }
}

// ---- mock ----

async function mockGetDocument(kind: LegalKind): Promise<LegalDocument> {
  return kind === 'terms' ? termsDocument : sellerContractDocument;
}

// ---- API real ----
// PROPOSTA DO FRONT, AINDA NÃO CONFIRMADA COM O BACK: `GET /legal/terms` e
// `GET /legal/seller-contract` e o shape `{ document_type, version, content,
// published_at }` batem com o PR back-end#187, que ainda está aberto (não
// mergeado). Confirmar nome, verbo e shape com o par de back-end antes de
// desligar o mock — divergência vira ajuste aqui, nunca na tela.

/** Valores de `document_type` no back (`CheckConstraint` do PR back-end#187). */
type ApiLegalDocumentType = 'termos_uso' | 'contrato_venda';

interface ApiLegalDocument {
  document_type: ApiLegalDocumentType;
  version: string;
  content: string;
  published_at: string;
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string };
}

const KIND_BY_DOCUMENT_TYPE: Record<ApiLegalDocumentType, LegalKind> = {
  termos_uso: 'terms',
  contrato_venda: 'seller-contract',
};

const PATH_BY_KIND: Record<LegalKind, string> = {
  terms: '/legal/terms',
  'seller-contract': '/legal/seller-contract',
};

function mapLegalDocument(document: ApiLegalDocument): LegalDocument {
  return {
    kind: KIND_BY_DOCUMENT_TYPE[document.document_type],
    version: document.version,
    publishedAt: document.published_at,
    content: document.content,
  };
}

/** Normaliza erro do axios pro mesmo `LegalError` do caminho mock. */
function toLegalError(error: unknown): LegalError {
  const data = (error as { response?: { data?: ApiErrorEnvelope } }).response?.data;
  if (data?.error?.code) {
    return new LegalError(
      data.error.code,
      data.error.message ?? 'Erro ao consultar documento jurídico.',
    );
  }
  return new LegalError('INTERNAL_ERROR', 'Erro ao consultar documento jurídico.');
}

async function apiGetDocument(kind: LegalKind): Promise<LegalDocument> {
  try {
    const { data } = await httpClient.get<ApiLegalDocument>(PATH_BY_KIND[kind]);
    return mapLegalDocument(data);
  } catch (error) {
    throw toLegalError(error);
  }
}

// ---- API pública do service ----

function getDocument(kind: LegalKind): Promise<LegalDocument> {
  return useMocks ? mockGetDocument(kind) : apiGetDocument(kind);
}

/** Termos de uso vigentes — aceitos por todo usuário no cadastro. */
export async function getTerms(): Promise<LegalDocument> {
  return getDocument('terms');
}

/** Contrato de venda vigente — aceito por quem vira vendedor. */
export async function getSellerContract(): Promise<LegalDocument> {
  return getDocument('seller-contract');
}
