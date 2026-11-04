/** Modelo interno das notificações, compatível com a API. */
export type Notification = {
  id: string;
  type: string;
  productId?: string;
  productName: string;
  orderId?: string;
  createdAt: string;
  isRead: boolean;
};