import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Button from '@/components/common/Button';
import Dialog from '@/components/common/Dialog';
import TextArea from '@/components/common/TextArea';
import { useToast } from '@/context/useToast';
import { AdminModerationError, suspendProduct } from '@/services/adminModerationService';
import type { ModerationResult } from '@/types/adminModeration';
import type { ProductStatus } from '@/types/product';

interface SuspendProductActionProps {
  productId: string;
  status: ProductStatus;
  onSuspended: (result: ModerationResult) => void;
}

function suspensionError(error: unknown, status: ProductStatus): string {
  if (error instanceof AdminModerationError) {
    if (error.code === 'PRODUCT_SOLD') return 'Esta peça já foi vendida e não pode ser suspensa.';
    if (error.httpStatus === 409) {
      if (error.code === 'PRODUCT_NOT_EDITABLE' && status === 'reservado') {
        return 'Esta peça está reservada em um pedido em aberto e não pode ser suspensa.';
      }
      return `O estado atual da peça impede a suspensão. ${error.message}`;
    }
    if (error.code === 'AUTH_REQUIRED')
      return 'Sua sessão precisa ser renovada para suspender o anúncio.';
    if (error.code === 'FORBIDDEN') return 'Você não tem permissão para suspender este anúncio.';
    if (error.httpStatus === 422) return error.message;
  }
  return 'Não foi possível suspender o anúncio. Tente novamente.';
}

/** A autorização visual é do detalhe; a operação continua autorizada pelo service/API.
 * O Dialog existente mantém foco e teclado. A justificativa vive nesta ação.
 */
export default function SuspendProductAction({
  productId,
  status,
  onSuspended,
}: SuspendProductActionProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const formId = useId();

  useEffect(() => {
    generation.current += 1;
    return () => {
      generation.current += 1;
    };
  }, [productId]);

  useLayoutEffect(() => {
    // Dialog não encaminha atributos DOM. A adaptação de aria-busy fica
    // limitada ao painel desta ação, sem modificar seu foco ou sua API.
    root.current?.querySelector('[role="dialog"]')?.setAttribute('aria-busy', String(submitting));
  }, [open, submitting]);

  function close() {
    if (busy.current) return;
    setOpen(false);
  }

  async function confirm() {
    if (busy.current || completed) return;
    if (!reason.trim()) {
      setReasonError('Informe o motivo da suspensão.');
      return;
    }
    busy.current = true;
    const request = generation.current;
    setSubmitting(true);
    setReasonError(undefined);
    setActionError(undefined);
    try {
      const result = await suspendProduct(productId, reason.trim());
      if (request !== generation.current) return;
      setCompleted(true);
      setOpen(false);
      onSuspended(result);
      toast('Anúncio suspenso com sucesso.', { kind: 'success' });
    } catch (error) {
      if (request !== generation.current) return;
      if (
        error instanceof AdminModerationError &&
        (error.fields?.reason || error.code === 'REASON_REQUIRED')
      ) {
        setReasonError(error.fields?.reason ?? error.message);
      } else {
        setActionError(suspensionError(error, status));
      }
    } finally {
      if (request === generation.current) {
        busy.current = false;
        setSubmitting(false);
      }
    }
  }

  return (
    <div ref={root}>
      <Button
        variant="outline"
        aria-disabled={completed}
        onClick={() => {
          if (completed || busy.current) return;
          setReasonError(undefined);
          setActionError(undefined);
          setOpen(true);
        }}
        className="w-full tablet:w-auto"
      >
        {completed ? 'Anúncio suspenso' : 'Suspender anúncio'}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Suspender anúncio"
        description="Informe por que este anúncio precisa ser retirado do ar."
        closeOnBackdrop={!submitting}
        footer={
          <div className="flex flex-col justify-end gap-3 tablet:flex-row">
            <Button variant="secondary" disabled={submitting} onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" form={formId} disabled={submitting}>
              {submitting ? 'Suspendendo…' : 'Confirmar suspensão'}
            </Button>
          </div>
        }
      >
        <form
          id={formId}
          className="overflow-y-auto"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <div role={reasonError ? 'alert' : undefined}>
            <TextArea
              id={fieldId}
              label="Motivo da suspensão"
              value={reason}
              disabled={submitting}
              error={reasonError}
              onChange={(value) => {
                setReason(value);
                setReasonError(undefined);
                setActionError(undefined);
              }}
            />
          </div>
          {actionError ? (
            <p role="alert" className="mt-3 text-body-sm text-vermelho-escuro">
              {actionError}
            </p>
          ) : null}
        </form>
      </Dialog>
    </div>
  );
}
