import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/context/useToast';
import {
  AdminReceiptError,
  approveReceipt,
  downloadReceipt,
  getReceiptReview,
  rejectReceipt,
} from '@/services/adminReceiptService';
import type { ReceiptReview } from '@/types/admin';

/** Arquivo do comprovante: baixado como Blob e mostrado por object URL. */
export type ReceiptFileState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; url: string; type: ReceiptReview['payment']['receiptType'] };

/** Ação em andamento: os botões ficam desabilitados enquanto não for `null`. */
export type ReviewSubmitting = 'approve' | 'reject' | null;

const REASON_REQUIRED_MESSAGE = 'Informe o motivo da rejeição.';
const FORBIDDEN_MESSAGE = 'Você não tem permissão para validar comprovantes.';
const GENERIC_ERROR_MESSAGE = 'Não foi possível concluir a validação. Tente de novo.';

/**
 * Lógica do painel de conferência de um comprovante (FE-US032-2): baixa o
 * arquivo pela rota autenticada, aprova e rejeita (RN-22, RN-23) e trata o 409
 * de quem chegou depois de outra pessoa. A tela só desenha.
 *
 * - `file`: o comprovante como Blob → object URL (liberada ao sair);
 * - `approve()` / `reject(motivo)`: devolvem `true` quando o item mudou (a
 *   tela fecha o diálogo) e `false` quando não (o diálogo fica aberto com a
 *   mensagem em `actionError`/`reasonError`);
 * - `onUpdated(item)`: o item novo, para a fila atualizar a linha e o painel;
 * - 409: relê o item e avisa a fila, sem erro genérico.
 *
 * Precisa estar dentro do `ToastProvider`.
 *
 * Usage:
 *   const { file, submitting, actionError, reasonError, approve, reject } =
 *     useReceiptReview(item, (updated) => setSelected(updated));
 *   const fechou = await reject('Comprovante ilegível.');
 */
export function useReceiptReview(item: ReceiptReview, onUpdated: (item: ReceiptReview) => void) {
  const { toast } = useToast();
  const { orderId } = item;
  const receiptType = item.payment.receiptType;

  const [file, setFile] = useState<ReceiptFileState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState<ReviewSubmitting>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  // Trava síncrona: dois cliques antes do primeiro render não enviam duas vezes.
  const busy = useRef(false);

  useEffect(() => {
    // Descarta a resposta de uma consulta que ficou velha (retry ou saída).
    let cancelled = false;
    let objectUrl: string | null = null;

    downloadReceipt(orderId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setFile({ status: 'ready', url: objectUrl, type: receiptType });
      })
      .catch(() => {
        if (!cancelled) setFile({ status: 'error' });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [orderId, receiptType, attempt]);

  const retryFile = useCallback(() => {
    setFile({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  const clearErrors = useCallback(() => {
    setActionError(null);
    setReasonError(null);
  }, []);

  /** Envia a ação; `true` quando o item mudou (inclusive pelo 409). */
  async function run(kind: 'approve' | 'reject', action: () => Promise<ReceiptReview>) {
    if (busy.current) return false;
    busy.current = true;
    setSubmitting(kind);
    setActionError(null);

    try {
      const updated = await action();
      onUpdated(updated);
      toast(kind === 'approve' ? 'Comprovante aprovado.' : 'Comprovante rejeitado.', {
        kind: 'success',
      });
      return true;
    } catch (error) {
      if (error instanceof AdminReceiptError && error.code === 'ALREADY_VALIDATED') {
        return reloadAfterConflict();
      }
      const forbidden = error instanceof AdminReceiptError && error.code === 'FORBIDDEN';
      setActionError(forbidden ? FORBIDDEN_MESSAGE : GENERIC_ERROR_MESSAGE);
      return false;
    } finally {
      busy.current = false;
      setSubmitting(null);
    }
  }

  /** 409: outra pessoa já validou. Relê o item e mostra o registro dela. */
  async function reloadAfterConflict() {
    try {
      onUpdated(await getReceiptReview(orderId));
      toast('Este comprovante já foi validado por outra pessoa.', { kind: 'info' });
      return true;
    } catch {
      setActionError(GENERIC_ERROR_MESSAGE);
      return false;
    }
  }

  const approve = () => run('approve', () => approveReceipt(orderId));

  async function reject(reason: string) {
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setReasonError(REASON_REQUIRED_MESSAGE);
      return false;
    }
    setReasonError(null);
    return run('reject', () => rejectReceipt(orderId, trimmed));
  }

  return {
    file,
    retryFile,
    submitting,
    actionError,
    reasonError,
    approve,
    reject,
    clearErrors,
  };
}
