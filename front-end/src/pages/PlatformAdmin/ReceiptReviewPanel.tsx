import { useId, useState } from 'react';
import clsx from 'clsx';
import { PaymentStatusBadge } from '@/components/admin/PaymentStatusBadge';
import Button from '@/components/common/Button';
import Dialog from '@/components/common/Dialog';
import { useReceiptReview } from '@/hooks/useReceiptReview';
import type { ReceiptReview } from '@/types/admin';
import { formatCentsToBRL, formatClock, formatDateTime, formatTimeAgo } from '@/utils/format';

/**
 * Painel de conferência do comprovante (FE-US032-2), abaixo da fila de
 * `/admin/receipts`. Mostra o comprovante (imagem na tela; PDF abre em nova
 * aba, ambos a partir do Blob da rota autenticada) ao lado dos dados do
 * pedido, com a comissão de 9% e o repasse líquido só para exibição.
 *
 * - "Aprovar pagamento": diálogo de confirmação simples (RN-22);
 * - "Rejeitar comprovante": diálogo com motivo obrigatório (RN-23);
 * - depois da ação, a fila recebe o item novo (`onUpdated`) e o painel mostra
 *   "Validado por … em …"; pedido já validado não tem botões, só o registro;
 * - botões desabilitados enquanto envia; erro mantém o diálogo aberto; o foco
 *   volta ao botão que abriu o diálogo (o `Dialog` cuida disso).
 *
 * Toda a lógica (download, envio, 409) está em `useReceiptReview`; aqui só
 * desenha. Precisa estar dentro do `ToastProvider`.
 *
 * Usage:
 *   <ReceiptReviewPanel item={selected} onUpdated={(updated) => setSelected(updated)} />
 */
type ReceiptReviewPanelProps = {
  item: ReceiptReview;
  /** Item atualizado depois de aprovar, rejeitar ou do 409. */
  onUpdated: (item: ReceiptReview) => void;
};

type OpenDialog = 'approve' | 'reject' | null;

/** Os valores do contrato vêm em reais; `formatCentsToBRL` pede centavos. */
const brl = (reais: number) => formatCentsToBRL(Math.round(reais * 100));

/**
 * Botões de ação mais compactos, como no Figma (texto de 11.5px), mas com os
 * tokens mais próximos (`label`, `px-4`) e a altura de toque do `Button`.
 * Só aqui: o `Button` compartilhado não muda. O `!` (important) é o que faz
 * valer sobre as classes de tamanho do próprio `Button`.
 */
const ACTION_BUTTON = '!px-4 !text-label !font-bold';

const rowClass =
  'flex min-h-8 items-center justify-between gap-4 border-b border-linha py-1 font-ui text-body-sm last:border-b-0';

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <li className={rowClass}>
      <span className="text-texto-auxiliar">{label}</span>
      <span
        className={clsx(
          'break-all text-right',
          strong ? 'text-body font-bold text-verde-rs' : 'font-semibold text-tinta',
        )}
      >
        {value}
      </span>
    </li>
  );
}

function ReceiptReviewPanel({ item, onUpdated }: ReceiptReviewPanelProps) {
  const { file, retryFile, submitting, actionError, reasonError, approve, reject, clearErrors } =
    useReceiptReview(item, onUpdated);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const errorId = useId();

  const { payment } = item;
  const pending = payment.status === 'pendente';
  const seller = item.store.sellerName
    ? `${item.store.sellerName} · ${item.store.name}`
    : item.store.name;

  function open(next: Exclude<OpenDialog, null>) {
    clearErrors();
    setDialog(next);
  }

  function close() {
    if (submitting) return;
    clearErrors();
    setReason('');
    setDialog(null);
  }

  async function confirmApprove() {
    if (await approve()) setDialog(null);
  }

  async function confirmReject() {
    if (await reject(reason)) {
      setReason('');
      setDialog(null);
    }
  }

  const dialogError = reasonError ?? actionError;

  return (
    <section
      aria-label={`Conferência do pedido #${item.orderId}`}
      className="flex flex-col gap-6 border border-linha bg-branco-quente p-5 tablet:p-8"
    >
      <div className="flex flex-col gap-3 tablet:flex-row tablet:items-start tablet:justify-between">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-h3 text-tinta">Pedido #{item.orderId}</h2>
          <p className="font-ui text-label text-texto-auxiliar">
            Comprovante anexado {formatTimeAgo(payment.submittedAt)} (
            {formatClock(payment.submittedAt)}) · Comprador: {item.buyer.name}
          </p>
        </div>
        <div>
          <PaymentStatusBadge status={payment.status} />
        </div>
      </div>

      <hr className="border-linha" />

      <div className="flex flex-col gap-6 web:flex-row web:gap-10">
        <div className="flex h-80 flex-1 flex-col items-center justify-center gap-3 border border-dashed border-linha bg-papel-profundo p-4 web:basis-0">
          {file.status === 'loading' && (
            <p className="font-ui text-body-sm text-texto-auxiliar">Carregando comprovante…</p>
          )}

          {file.status === 'error' && (
            <div role="alert" className="flex flex-col items-center gap-3 text-center">
              <p className="font-ui text-body-sm text-vermelho-escuro">
                Não foi possível carregar o comprovante.
              </p>
              <Button variant="secondary" onClick={retryFile}>
                Tentar de novo
              </Button>
            </div>
          )}

          {file.status === 'ready' && file.type === 'image' && (
            <img
              src={file.url}
              alt={`Comprovante do pedido #${item.orderId}`}
              className="h-full w-full object-contain"
            />
          )}

          {file.status === 'ready' && file.type === 'pdf' && (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-ui text-body font-semibold text-vermelho-escuro underline"
            >
              Abrir comprovante (PDF)
            </a>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-6 web:basis-0">
          <ul aria-label="Dados do pedido" className="flex flex-col">
            <Row label="Comprador" value={item.buyer.name} />
            <Row label="Vendedor (Loja)" value={seller} />
            <Row label="Peça comprada" value={item.items.map((piece) => piece.name).join(', ')} />
            <Row label="Valor do depósito" value={brl(item.totalAmount)} />
            <Row label="Comissão Vintex (9%)" value={brl(item.platformFee)} />
            <Row label="Repasse líquido ao vendedor" value={brl(item.sellerNetAmount)} strong />
            <Row label="Chave Pix do vendedor" value={item.store.pixKey ?? '—'} />
          </ul>

          {pending && (
            <div className="flex flex-wrap gap-3">
              <Button
                variant="success"
                className={ACTION_BUTTON}
                disabled={submitting !== null}
                onClick={() => open('approve')}
              >
                ✓ Aprovar pagamento
              </Button>
              <Button
                variant="secondary"
                className={`${ACTION_BUTTON} !border`}
                disabled={submitting !== null}
                onClick={() => open('reject')}
              >
                ✕ Rejeitar comprovante
              </Button>
            </div>
          )}

          {!pending && payment.validatedBy && payment.validatedAt && (
            <div className="flex flex-col gap-1 bg-papel-profundo px-4 py-4">
              <p className="font-ui text-body-sm font-semibold text-tinta">
                {`Validado por ${payment.validatedBy.name} em ${formatDateTime(payment.validatedAt)}`}
              </p>
              {payment.rejectionReason && (
                <p className="font-ui text-body-sm text-texto-auxiliar">
                  {`Motivo: ${payment.rejectionReason}`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={dialog === 'approve'}
        onClose={close}
        title="Aprovar pagamento?"
        description="O pedido passa para confirmado e o repasse ao vendedor fica liberado."
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={submitting !== null} onClick={close}>
              Cancelar
            </Button>
            <Button variant="success" disabled={submitting !== null} onClick={confirmApprove}>
              {submitting === 'approve' ? 'Aprovando…' : 'Confirmar aprovação'}
            </Button>
          </div>
        }
      >
        {actionError && (
          <p role="alert" className="font-ui text-body-sm text-vermelho-escuro">
            {actionError}
          </p>
        )}
      </Dialog>

      <Dialog
        open={dialog === 'reject'}
        onClose={close}
        title="Rejeitar comprovante"
        description="O comprador será avisado e poderá enviar outro comprovante."
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={submitting !== null} onClick={close}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={submitting !== null} onClick={confirmReject}>
              {submitting === 'reject' ? 'Rejeitando…' : 'Confirmar rejeição'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <label htmlFor={reasonId} className="font-ui text-body-sm font-semibold text-tinta">
            Motivo da rejeição
          </label>
          <textarea
            id={reasonId}
            value={reason}
            rows={4}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={dialogError ? errorId : undefined}
            onChange={(event) => {
              setReason(event.target.value);
              clearErrors();
            }}
            className={clsx(
              'w-full border bg-branco-quente p-3 font-ui text-body text-tinta focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta',
              reasonError ? 'border-vermelho-escuro' : 'border-linha',
            )}
          />
          {dialogError && (
            <p id={errorId} role="alert" className="font-ui text-body-sm text-vermelho-escuro">
              {dialogError}
            </p>
          )}
        </div>
      </Dialog>
    </section>
  );
}

export default ReceiptReviewPanel;
