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
  onboarding: '/onboarding',
  styleGuide: '/style-guide',
} as const;

/** Monta o link real pro detalhe de um produto (`paths.product` é só o padrão da rota). */
export function productDetail(id: string): string {
  return `/product/${id}`;
}
