/**
 * Rotas do app — string única por tela, reaproveitada por `AppRoutes` e
 * por quem precisar linkar/redirecionar (ex.: guardas de rota, FE-US005-3).
 */
export const paths = {
  home: '/',
  catalog: '/catalog',
  /** Padrão de rota para `<Route path>` — para montar um link real, use `productDetail(id)`. */
  product: '/product/:id',
  login: '/login',
  register: '/register',
  /**
   * Onboarding: a seleção de estilos (FE-US004-1). Estava sob
   * `/style-guide/selection`, aninhada na rota do guia interno, enquanto o
   * cadastro navegava para `/onboarding`, que renderizava um placeholder.
   */
  onboarding: '/onboarding',
  /**
   * Conversa com a assistente Vintex (#143). A tela existia pronta e sem
   * rota: só se chegava nela importando o componente.
   */
  vintex: '/vintex',
  styleGuide: '/style-guide',
  /**
   * Rotas da Sprint 2 (FE-FND-4, #205) — declaradas aqui pra liberar as
   * tasks de tela em paralelo; cada uma ainda renderiza um placeholder em
   * `AppRoutes.tsx` até a task correspondente entrar.
   */
  sell: '/sell',
  seller: '/seller',
  /** Padrão de rota para `<Route path>` — para montar um link real, use `sellerProductPath(id)`. */
  sellerProductNew: '/seller/products/new',
  sellerProduct: '/seller/products/:id',
  /**
   * Revisão antes de publicar (FE-US016-1, #218). Sempre de um rascunho que já
   * existe: quem chega aqui passou pelo "Continuar para revisão", que salva.
   * Para montar um link real, use `sellerProductReviewPath(id)`.
   */
  sellerProductReview: '/seller/products/:id/review',
  cart: '/cart',
  /** Padrão de rota para `<Route path>` — para montar um link real, use `storeProfile(id)`. */
  store: '/store/:id',
  profilePreferences: '/profile/preferences',
  /** Rotas da Sprint 3 (FE-FND-6, #302), com placeholders até as tasks de tela. */
  checkout: '/checkout',
  orders: '/profile/orders',
  /** Padrão de rota para `<Route path>` — para montar um link real, use `orderDetailPath(id)`. */
  orderDetail: '/profile/orders/:id',
  /** Padrão de rota para `<Route path>` — para montar um link real, use `orderPaymentPath(id)`. */
  orderPayment: '/profile/orders/:id/payment',
  favorites: '/profile/favorites',
  adminReceipts: '/admin/receipts',
  stores: '/stores',
} as const;

/** Monta o link real pro detalhe de um produto (`paths.product` é só o padrão da rota). */
export function productDetail(id: string): string {
  return `/product/${id}`;
}

/**
 * Monta o link real pro formulário de edição de uma peça do vendedor
 * (`paths.sellerProduct` é só o padrão da rota). `section` vira o hash que o
 * formulário usa para focar o bloco certo ao voltar da revisão (#218).
 */
export function sellerProductPath(id: string, section?: string): string {
  return section ? `/seller/products/${id}#${section}` : `/seller/products/${id}`;
}

/** Monta o link real pra revisão de um rascunho (`paths.sellerProductReview` é só o padrão da rota). */
export function sellerProductReviewPath(id: string): string {
  return `/seller/products/${id}/review`;
}

/** Monta o link real pro perfil público de uma loja (`paths.store` é só o padrão da rota). */
export function storeProfile(id: string): string {
  return `/store/${id}`;
}

/** Monta o link real pro detalhe de um pedido (`paths.orderDetail` é só o padrão da rota). */
export function orderDetailPath(id: string): string {
  return `${paths.orders}/${id}`;
}

/** Monta o link real pro pagamento de um pedido (`paths.orderPayment` é só o padrão da rota). */
export function orderPaymentPath(id: string): string {
  return `${orderDetailPath(id)}/payment`;
}
