import { useState } from 'react';
import Button from '@/components/common/Button';
import Dialog from '@/components/common/Dialog';

export type CancelOrderDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Rejeita quando o cancelamento falha; o diálogo mostra o aviso. */
  onConfirm: () => Promise<void>;
};

/**
 * Confirmação de "Cancelar pedido". Só apresentação: quem cancela é a página.
 * Diz o que acontece com as peças e avisa quem já pagou para não cancelar.
 *
 * Usage:
 *   <CancelOrderDialog open={aberto} onClose={fechar} onConfirm={cancelar} />
 */
function CancelOrderDialog({ open, onClose, onConfirm }: CancelOrderDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  function handleClose() {
    if (submitting) return;
    setFailed(false);
    onClose();
  }

  async function handleConfirm() {
    setFailed(false);
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Cancelar pedido?"
      description="As peças voltam a ficar à venda na loja. Se você já fez o Pix, não cancele: envie o comprovante."
      closeOnBackdrop={!submitting}
      footer={
        <div className="flex flex-col-reverse gap-3 tablet:flex-row tablet:justify-end">
          <Button variant="secondary" disabled={submitting} onClick={handleClose}>
            Manter pedido
          </Button>
          <Button disabled={submitting} onClick={() => void handleConfirm()}>
            {submitting ? 'Cancelando…' : 'Sim, cancelar'}
          </Button>
        </div>
      }
    >
      {failed ? (
        <p role="alert" className="font-ui text-body-sm text-vermelho-escuro">
          Não foi possível cancelar o pedido. Confira a situação dele e tente de novo.
        </p>
      ) : null}
    </Dialog>
  );
}

export default CancelOrderDialog;
