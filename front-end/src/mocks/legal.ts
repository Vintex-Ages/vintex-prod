import type { LegalDocument } from '@/types/legal';

/**
 * Placeholders dos dois documentos jurídicos (FE-SVC-legal, #203). O texto
 * real vem da stakeholder (P-03); até lá, cada documento tem sua própria versão
 * placeholder (são artefatos distintos, RN-93) e conteúdo marcado como
 * provisório pra ninguém confundir com o texto que vale.
 */
export const termsDocument: LegalDocument = {
  kind: 'terms',
  version: 'termos-0.1-placeholder',
  publishedAt: '2026-09-25T00:00:00.000Z',
  content:
    '[TEXTO PROVISÓRIO — não é o texto jurídico final]\n\n' +
    'Termos de uso da plataforma Vintex. Este conteúdo é um placeholder e será ' +
    'substituído pela versão oficial enviada pela stakeholder.',
};

export const sellerContractDocument: LegalDocument = {
  kind: 'seller-contract',
  version: 'contrato-0.1-placeholder',
  publishedAt: '2026-09-25T00:00:00.000Z',
  content:
    '[TEXTO PROVISÓRIO — não é o texto jurídico final]\n\n' +
    'Contrato de venda para quem anuncia peças na Vintex. Este conteúdo é um ' +
    'placeholder e será substituído pela versão oficial enviada pela stakeholder.',
};
