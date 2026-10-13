/**
 * Contrato de dados do Pedido do comprador (FE-SVC-orders, issue #311).
 *
 * Vocabulário (`CONTEXT.md`, raiz do repo, atualizado 30/09): um Pedido é a
 * compra das peças de **uma única loja**; finalizar um carrinho com N lojas
 * gera N Pedidos, um por vez (modelagem `orders §1.11`).
 */

/**
 * Os seis status da VS-023. Nenhum status além destes — rejeição de
 * comprovante NÃO é um sétimo status, é lida de `payment.status` (RN-23,
 * ver `Order.payment` abaixo).
 */
export type OrderStatus =
  'aguardando_comprovante' | 'em_analise' | 'confirmado' | 'preparando' | 'enviado' | 'concluido';

export type PaymentStatus = 'pendente' | 'aprovado' | 'rejeitado';

/**
 * Peça do Pedido, congelada no momento da compra (nome/preço/foto não
 * mudam depois, mesmo que a peça no catálogo mude ou saia do ar) — por
 * isso tem seu próprio shape, não reaproveita `Product`.
 */
export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  coverImageUrl: string | null;
}

export interface DeliveryAddress {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
}

export interface Order {
  id: string;
  store: { id: string; name: string; pixKey: string | null };
  items: OrderItem[];
  /** Soma das peças — é o que o comprador paga. Em reais, não em centavos. */
  productAmount: number;
  /** Comissão de 9% (RN-11), descontada do vendedor — só exibição, não é subtraída do que o comprador paga. */
  platformFee: number;
  /** = `productAmount`. Campo próprio porque é o valor mostrado como "total" na tela, mesmo sendo igual. */
  totalAmount: number;
  status: OrderStatus;
  history: { status: OrderStatus; at: string }[];
  deliveryAddress: DeliveryAddress;
  /**
   * `null` até o primeiro envio de comprovante. Rejeição (RN-23) não cria
   * status novo no Pedido: `status` volta a `'aguardando_comprovante'`,
   * e é `payment.status === 'rejeitado'` + `rejectionReason` que contam a
   * história pro comprador.
   */
  payment: {
    status: PaymentStatus;
    receiptName?: string;
    submittedAt?: string;
    rejectionReason?: string;
  } | null;
  createdAt: string;
}

/** Shape enxuto pra listagem ("Meus Pedidos") — sem `history`/`deliveryAddress`/`platformFee`. */
export type OrderSummary = Pick<
  Order,
  'id' | 'store' | 'items' | 'totalAmount' | 'status' | 'payment' | 'createdAt'
>;
