/**
 * Contratos da Reclamação sobre um Pedido (FE-SVC-order-reports, issue #426).
 *
 * Reclamação (RN-77): o comprador reporta problema num Pedido já confirmado.
 * Não é pública (RN-78): só a administradora a lê, e não há chat direto (RN-79).
 */

/** Os dois motivos aceitos, e só eles (back-end#268). */
export type OrderReportReason = 'nao_recebido' | 'danificado';

export const ORDER_REPORT_REASONS: readonly OrderReportReason[] = ['nao_recebido', 'danificado'];

/** Teto do texto da Reclamação, igual ao do back (`OrderComplaintCreate`). */
export const ORDER_REPORT_DESCRIPTION_MAX = 1000;

/** Reclamação criada, como o comprador a recebe de volta. */
export interface OrderReport {
  id: string;
  orderId: string;
  reason: OrderReportReason;
  /** Texto livre: é o conteúdo da Reclamação (diferente da Avaliação, que não tem texto). */
  description: string;
  createdAt: string;
}

/**
 * Item da listagem da administradora: a Reclamação mais quem reclamou e de qual loja.
 *
 * O comprador vem sem `id`: a rota da administradora manda nome, e-mail e
 * telefone, que é o que a RN-79 pede para ela intermediar, e nenhum id.
 */
export interface AdminOrderReport extends OrderReport {
  buyer: { name: string };
  store: { id: string; name: string };
}

export interface ListReportsParams {
  page?: number;
  pageSize?: number;
}
