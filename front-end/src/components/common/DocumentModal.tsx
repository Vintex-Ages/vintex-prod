import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import Dialog from './Dialog';
import type { LegalDocument, LegalKind } from '@/types/legal';

export type DocumentModalProps = {
  open: boolean;
  document: LegalDocument;
  onAccept: (version: string) => void;
  onDecline: () => void;
  /** "Aceitar" só habilita depois de rolar o texto até o fim. */
  requireScrollToEnd?: boolean;
};

/** O back não manda título (PR back-end#187); o rótulo sai do `kind`. */
const TITLE_BY_KIND: Record<LegalKind, string> = {
  terms: 'Termos de uso',
  'seller-contract': 'Contrato de venda',
};

// Folga de 1px: com zoom do navegador `scrollTop` pode vir fracionado e nunca
// igualar exatamente `scrollHeight - clientHeight`.
function reachedEnd(element: HTMLElement): boolean {
  return element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
}

/**
 * Documento jurídico versionado dentro de um `Dialog` (FE-CMP-28, RN-93):
 * título, versão, texto rolável e as ações Aceitar / Não aceitar. Aceitar
 * devolve a versão exibida — quem chama grava o aceite (`register`,
 * `createStore`). Fechar (X ou ESC) conta como "Não aceitar". Sem busca de
 * dados: o documento chega pronto por prop.
 *
 * Usage:
 *   import DocumentModal from '@/components/common/DocumentModal';
 *   <DocumentModal
 *     open={mostrarTermos}
 *     document={termos}
 *     requireScrollToEnd
 *     onAccept={(versao) => aceitar(versao)}
 *     onDecline={() => setMostrarTermos(false)}
 *   />
 */
function DocumentModal({
  open,
  document,
  onAccept,
  onDecline,
  requireScrollToEnd = false,
}: DocumentModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  // Texto curto que cabe sem rolar já conta como lido.
  useEffect(() => {
    if (!open) return;
    setScrolledToEnd(bodyRef.current ? reachedEnd(bodyRef.current) : false);
  }, [open, document.content]);

  const acceptDisabled = requireScrollToEnd && !scrolledToEnd;

  return (
    <Dialog
      open={open}
      onClose={onDecline}
      title={TITLE_BY_KIND[document.kind]}
      description={<p>Versão {document.version}</p>}
      size="full"
      closeOnBackdrop={false}
      footer={
        <>
          {acceptDisabled && (
            <p className="mb-3 font-ui text-label text-texto-auxiliar">
              Role até o fim do documento para aceitar.
            </p>
          )}
          <div className="flex flex-col gap-3 web:flex-row-reverse">
            <Button
              variant="primary"
              disabled={acceptDisabled}
              onClick={() => onAccept(document.version)}
              className="web:flex-1"
            >
              Aceitar
            </Button>
            <Button variant="quiet" onClick={onDecline} className="web:flex-1">
              Não aceitar
            </Button>
          </div>
        </>
      }
    >
      <div
        ref={bodyRef}
        // Região rolável precisa ser focável para quem navega só por teclado.
        tabIndex={0}
        role="document"
        aria-label={`Texto: ${TITLE_BY_KIND[document.kind]}`}
        onScroll={(event) => {
          if (reachedEnd(event.currentTarget)) setScrolledToEnd(true);
        }}
        className="min-h-0 flex-1 overflow-y-auto whitespace-pre-line border border-linha p-4 font-ui text-body text-tinta focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
      >
        {document.content}
      </div>
    </Dialog>
  );
}

export default DocumentModal;
