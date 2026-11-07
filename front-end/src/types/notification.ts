/** Modelo interno do frontend; não representa um contrato HTTP do backend. */
export type Notification = {
  id: string;
  recipientUserId: string;
  productName: string;
  createdAt: string;
  isRead: boolean;
} & ({ type: 'sale'; productId?: string } | { type: 'favorite'; productId: string });
