import { useRef, useState } from 'react';
import type { MediaItem } from '@/components/common/MediaUploader';
import { useAuth } from '@/context/useAuth';
import { deriveOrderView, useOrderDetail } from '@/hooks/useOrderDetail';
import { OrderError, submitReceipt } from '@/services/orderService';
import type { Order } from '@/types/order';

/**
 * Em que ponto do pagamento o Pedido está, derivado de `status` + `payment`.
 *
 * - `payable`: ainda dá para pagar (`aguardando_comprovante`), com ou sem
 *   comprovante recusado antes (RN-23).
 * - `expired`: o prazo venceu sem comprovante aprovado e as peças voltaram
 *   para a loja (back-end#280); não há o que pagar.
 * - `closed`: já saiu de `aguardando_comprovante` — pagar de novo duplicaria
 *   o Pedido, então a página manda para o detalhe.
 */
export type OrderPaymentStage =
  | { kind: 'payable'; rejected: boolean; rejectionReason: string | null }
  | { kind: 'expired' }
  | { kind: 'closed' };

/** O que aconteceu no envio; a página decide o que mostrar e para onde ir. */
export type SendReceiptResult = 'sent' | 'closed' | 'blocked' | 'error';

const NO_FILE_MESSAGE = 'Anexe o comprovante para continuar.';
const GENERIC_ERROR = 'Não foi possível enviar o comprovante. Tente de novo.';

/**
 * Erros do envio que já trazem o texto certo do back (413 e 415, mapeados em
 * `orderService`). Os demais viram a mensagem genérica.
 */
const RECEIPT_ERROR_CODES = new Set(['RECEIPT_TOO_LARGE', 'RECEIPT_INVALID_TYPE']);

/**
 * Regras da etapa 2 do pagamento (FE-US022-2, #320). Reaproveita
 * `deriveOrderView` do detalhe para não ter duas leituras de RN-23.
 */
export function deriveOrderPaymentStage(
  order: Pick<Order, 'status' | 'payment'>,
): OrderPaymentStage {
  const view = deriveOrderView(order);

  if (view.expired) return { kind: 'expired' };
  if (view.paymentAction === null) return { kind: 'closed' };

  return {
    kind: 'payable',
    rejected: view.paymentAction === 'resend',
    rejectionReason: view.rejectionReason,
  };
}

/**
 * Pagamento Pix de **um** Pedido (FE-US022-2, #320; VS-022): lê o Pedido,
 * guarda o comprovante escolhido e o envia. A página só desenha.
 *
 * - A carga é a do `useOrderDetail` (mesma leitura e recarga ao voltar à aba),
 *   então a tela também percebe quando a administradora mexe no Pedido.
 * - `send()` envia uma vez só (trava síncrona contra duplo clique, lição da
 *   #283) e não descarta o arquivo quando o upload falha: o comprador só
 *   troca o arquivo se quiser.
 * - `ORDER_NOT_AWAITING_RECEIPT` (409) devolve `'closed'`: o Pedido saiu da
 *   etapa enquanto a tela estava aberta (outra aba, ou a administradora).
 *
 * Usage:
 *   const { state, stage, receipt, setReceipt, send, submitting } = useOrderPayment(id);
 *   const result = await send();
 *   if (result === 'sent') navigate(orderDetailPath(id), { replace: true });
 */
export function useOrderPayment(id: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id;
  const { state, reload } = useOrderDetail(id);
  const [receipt, setReceiptValue] = useState<MediaItem[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  const stage = state.status === 'ready' ? deriveOrderPaymentStage(state.order) : null;

  function setReceipt(items: MediaItem[]) {
    setReceiptValue(items);
    // Escolher outro arquivo responde ao aviso e limpa o erro do envio anterior.
    setFileError(null);
    setSubmitError(null);
  }

  async function send(): Promise<SendReceiptResult> {
    if (busy.current || !userId || !id) return 'blocked';

    const file = receipt[0]?.file;
    if (!file) {
      setFileError(NO_FILE_MESSAGE);
      return 'blocked';
    }

    busy.current = true;
    setSubmitting(true);
    setFileError(null);
    setSubmitError(null);

    try {
      await submitReceipt(userId, id, file);
      return 'sent';
    } catch (error) {
      if (error instanceof OrderError) {
        if (error.code === 'ORDER_NOT_AWAITING_RECEIPT') return 'closed';
        setSubmitError(RECEIPT_ERROR_CODES.has(error.code) ? error.message : GENERIC_ERROR);
        return 'error';
      }

      setSubmitError(GENERIC_ERROR);
      return 'error';
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  return {
    state,
    stage,
    reload,
    receipt,
    setReceipt,
    fileError,
    submitError,
    submitting,
    send,
  };
}
