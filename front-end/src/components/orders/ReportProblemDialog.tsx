import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Button from '@/components/common/Button';
import Dialog from '@/components/common/Dialog';
import FormErrorSummary from '@/components/common/FormErrorSummary';
import Select from '@/components/common/Select';
import TextArea from '@/components/common/TextArea';
import { OrderReportError, reportOrder, type OrderReportField } from '@/services/reportService';
import { ORDER_REPORT_REASONS, type OrderReportReason } from '@/types/report';

/**
 * "Reportar problema" num Pedido (FE-US025-1, #410; RN-77/RN-78). Formulário
 * em `Dialog`: o comprador escolhe um dos dois motivos e descreve o problema;
 * o envio vai ao `reportOrder`.
 *
 * Erros seguem o ADR 0003: o campo não anuncia o próprio erro, o
 * `FormErrorSummary` é a única região `alert` e leva o foco ao primeiro campo
 * inválido a cada envio recusado (inclusive o `422` do back com `field`). Erro
 * do back que não é de campo ganha `role="alert"` próprio, com a mensagem do
 * `OrderReportError`, e o formulário continua preenchido.
 *
 * Depois do envio, só a confirmação de que a Reclamação foi à administradora:
 * nada do que foi escrito volta para a tela (RN-78). Quem decide quando o
 * botão aparece é a página, com `canReportOrder`.
 *
 * Usage:
 *   {reportingId ? (
 *     <ReportProblemDialog
 *       key={reportingId}
 *       open
 *       orderId={reportingId}
 *       onClose={() => setReportingId(null)}
 *     />
 *   ) : null}
 */
export type ReportProblemDialogProps = {
  open: boolean;
  orderId: string;
  onClose: () => void;
};

const REASON_LABELS: Record<OrderReportReason, string> = {
  nao_recebido: 'Não recebi o pedido',
  danificado: 'Chegou danificado',
};

const REASON_OPTIONS = ORDER_REPORT_REASONS.map((value) => ({
  value,
  label: REASON_LABELS[value],
}));

const REASON_REQUIRED = 'Escolha o motivo.';
const DESCRIPTION_REQUIRED = 'Descreva o problema.';
const GENERIC_ERROR = 'Não foi possível enviar a reclamação. Tente de novo.';

type FieldErrors = Partial<Record<OrderReportField, string>>;

function isReason(value: string | null): value is OrderReportReason {
  return ORDER_REPORT_REASONS.includes(value as OrderReportReason);
}

function ReportProblemDialog({ open, orderId, onClose }: ReportProblemDialogProps) {
  const [reason, setReason] = useState<OrderReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitCount, setSubmitCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const formId = `${baseId}-form`;
  const reasonId = `${baseId}-reason`;
  const descriptionId = `${baseId}-description`;

  // O botão de envio some com a confirmação: o foco não pode cair fora do diálogo.
  useEffect(() => {
    if (sent) confirmationRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [sent]);

  function handleClose() {
    if (submitting) return;
    setReason(null);
    setDescription('');
    setFieldErrors({});
    setSubmitError(null);
    setSent(false);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const errors: FieldErrors = {};
    if (!reason) errors.reason = REASON_REQUIRED;
    if (description.trim().length === 0) errors.description = DESCRIPTION_REQUIRED;
    setFieldErrors(errors);
    setSubmitCount((count) => count + 1);
    if (!reason || errors.description) return;

    setSubmitting(true);
    try {
      await reportOrder(orderId, reason, description);
      setSent(true);
    } catch (error) {
      if (error instanceof OrderReportError && error.field) {
        setFieldErrors({ [error.field]: error.message });
        // Conta como envio recusado: o resumo leva o foco ao campo.
        setSubmitCount((count) => count + 1);
      } else {
        setSubmitError(error instanceof OrderReportError ? error.message : GENERIC_ERROR);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        title="Reportar problema"
        footer={
          <div ref={confirmationRef} className="flex justify-end">
            <Button onClick={handleClose}>Entendi</Button>
          </div>
        }
      >
        <p role="status" className="font-ui text-body text-tinta">
          Reclamação enviada à administradora da Vintex. Ela vai analisar o caso.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Reportar problema"
      description="Só a administradora da Vintex lê a reclamação. Ela não aparece no pedido, no anúncio nem na loja."
      size="md"
      closeOnBackdrop={!submitting}
      footer={
        <div className="flex flex-col-reverse gap-3 tablet:flex-row tablet:justify-end">
          <Button variant="secondary" disabled={submitting} onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={submitting}>
            {submitting ? 'Enviando…' : 'Enviar reclamação'}
          </Button>
        </div>
      }
    >
      <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormErrorSummary
          submitCount={submitCount}
          items={[
            { id: reasonId, message: fieldErrors.reason },
            { id: descriptionId, message: fieldErrors.description },
          ]}
        />

        {submitError ? (
          <p role="alert" className="font-ui text-body-sm text-vermelho-escuro">
            {submitError}
          </p>
        ) : null}

        <Select
          id={reasonId}
          label="Motivo"
          value={reason}
          onChange={(value) => setReason(isReason(value) ? value : null)}
          options={REASON_OPTIONS}
          placeholder="Escolha o motivo"
          error={fieldErrors.reason}
          disabled={submitting}
        />

        <TextArea
          id={descriptionId}
          label="Descrição"
          value={description}
          onChange={setDescription}
          rows={5}
          placeholder="Conte o que aconteceu com o pedido."
          error={fieldErrors.description}
          disabled={submitting}
        />
      </form>
    </Dialog>
  );
}

export default ReportProblemDialog;
