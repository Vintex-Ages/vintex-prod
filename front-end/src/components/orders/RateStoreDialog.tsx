import { useEffect, useId, useRef, useState } from 'react';
import Button from '@/components/common/Button';
import Dialog from '@/components/common/Dialog';
import StarRating from '@/components/common/StarRating';
import { rateStore, StoreError } from '@/services/storeService';

/**
 * "Avaliar loja" num Pedido concluído (FE-US026-1, #409; RN-75/RN-76). Em
 * `Dialog`: o comprador escolhe de 1 a 5 estrelas (`StarRating` em `select`) e
 * envia. **Sem campo de texto** (RN-75).
 *
 * Um campo só, então não há validação no envio: "Enviar avaliação" fica
 * desabilitado até haver nota, com a instrução visível acima. Por isso o
 * diálogo não usa o `FormErrorSummary` do ADR 0003.
 *
 * Depois do envio, a confirmação. `409 ALREADY_RATED` não é erro: o Pedido já
 * tem nota (outra aba, outra sessão) e a tela diz isso no mesmo lugar da
 * confirmação. Nos dois casos `onRated` avisa a página, que tira o botão do
 * Pedido. Outro erro do back (ex.: `403 RATING_NOT_ALLOWED`) ganha
 * `role="alert"` com a mensagem dele, e a nota escolhida continua.
 *
 * Quem decide quando o botão aparece é a página, com `canRateOrder`.
 *
 * Usage:
 *   {rating ? (
 *     <RateStoreDialog
 *       key={rating.orderId}
 *       open
 *       orderId={rating.orderId}
 *       store={rating.store}
 *       onRated={marcarAvaliado}
 *       onClose={() => setRating(null)}
 *     />
 *   ) : null}
 */
export type RateStoreDialogProps = {
  open: boolean;
  orderId: string;
  store: { id: string; name: string };
  /** O Pedido passou a ter nota: envio aceito ou `409 ALREADY_RATED`. */
  onRated: (orderId: string) => void;
  onClose: () => void;
};

const GENERIC_ERROR = 'Não foi possível enviar a avaliação. Tente de novo.';

const CONFIRMATION: Record<'rated' | 'already_rated', string> = {
  rated: 'Avaliação enviada. Obrigado por avaliar a loja!',
  already_rated: 'Você já avaliou a loja neste pedido.',
};

/** A mensagem do back quando ela é dele; a genérica quando a falha foi de rede. */
function messageOf(error: unknown): string {
  return error instanceof StoreError && error.code !== 'INTERNAL_ERROR'
    ? error.message
    : GENERIC_ERROR;
}

function RateStoreDialog({ open, orderId, store, onRated, onClose }: RateStoreDialogProps) {
  const [score, setScore] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<keyof typeof CONFIRMATION | null>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const hintId = useId();

  // O botão de envio some com a confirmação: o foco não pode cair fora do diálogo.
  useEffect(() => {
    if (outcome) confirmationRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [outcome]);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit() {
    if (score === null) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await rateStore(store.id, orderId, score);
      setOutcome('rated');
      onRated(orderId);
    } catch (error) {
      if (error instanceof StoreError && error.code === 'ALREADY_RATED') {
        setOutcome('already_rated');
        onRated(orderId);
      } else {
        setSubmitError(messageOf(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (outcome) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        title="Avaliar loja"
        footer={
          <div ref={confirmationRef} className="flex justify-end">
            <Button onClick={handleClose}>Entendi</Button>
          </div>
        }
      >
        <p role="status" className="font-ui text-body text-tinta">
          {CONFIRMATION[outcome]}
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Avaliar loja"
      description={`Dê uma nota para a loja ${store.name}.`}
      size="md"
      closeOnBackdrop={!submitting}
      footer={
        <div className="flex flex-col-reverse gap-3 tablet:flex-row tablet:justify-end">
          <Button variant="secondary" disabled={submitting} onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={score === null || submitting}
            aria-describedby={score === null ? hintId : undefined}
          >
            {submitting ? 'Enviando…' : 'Enviar avaliação'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p id={hintId} className="font-ui text-body-sm text-texto-auxiliar">
          Escolha de 1 a 5 estrelas.
        </p>

        <StarRating
          mode="select"
          value={score ?? undefined}
          onChange={setScore}
          ariaLabel={`Nota para a loja ${store.name}`}
        />

        {submitError ? (
          <p role="alert" className="font-ui text-body-sm text-vermelho-escuro">
            {submitError}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

export default RateStoreDialog;
