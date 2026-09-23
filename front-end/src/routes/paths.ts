/**
 * Rotas da Sprint 1 — string única por tela, reaproveitada por `AppRoutes` e
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
  cart: '/cart',
  /** Padrão de rota para `<Route path>` — para montar um link real, use `storeProfile(id)`. */
  store: '/store/:id',
  profilePreferences: '/profile/preferences',
} as const;

/** Monta o link real pro detalhe de um produto (`paths.product` é só o padrão da rota). */
export function productDetail(id: string): string {
  return `/product/${id}`;
}

/** Monta o link real pro formulário de edição de uma peça do vendedor (`paths.sellerProduct` é só o padrão da rota). */
export function sellerProductPath(id: string): string {
  return `/seller/products/${id}`;
}

/** Monta o link real pro perfil público de uma loja (`paths.store` é só o padrão da rota). */
export function storeProfile(id: string): string {
  return `/store/${id}`;
}
