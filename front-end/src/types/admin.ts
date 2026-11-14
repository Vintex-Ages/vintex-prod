/**
 * Contratos da área administrativa (FE-SVC-admin-receipts, issue #312).
 *
 * Comprovante de Pix enviado pelo comprador, na visão da administradora.
 * Dinheiro em reais (não centavos), como os demais services.
 */

import type { OrderItem, PaymentStatus } from '@/types/order';

export interface ReceiptReview {
  orderId: string;
  buyer: { name: string; email: string; phone?: string };
  store: { id: string; name: string; sellerName?: string; pixKey: string | null };
  items: OrderItem[];
  totalAmount: number;
  /** Comissão de 9% (RN-11) — exibição. */
  platformFee: number;
  /** `totalAmount` − `platformFee` — exibição. */
  sellerNetAmount: number;
  payment: {
    status: PaymentStatus;
    /** Rota autenticada `GET /api/admin/payments/{order_id}/receipt` (não é URL pública de mídia). */
    receiptUrl: string;
    receiptType: 'image' | 'pdf';
    submittedAt: string;
    /** RN-22: quem validou e quando. */
    validatedBy?: { id: string; name: string };
    validatedAt?: string;
    /** RN-23. */
    rejectionReason?: string;
  };
}

export interface ListReceiptsParams {
  status?: PaymentStatus;
  q?: string;
  page?: number;
}
