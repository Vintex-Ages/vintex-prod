/**
 * Navegação principal, compartilhada entre `Header` e `Footer`.
 * Hrefs em inglês (convenção do projeto) e como `<a>` — o router ainda não
 * está montado (#106); trocar por `paths.*` + `<Link>` quando entrar.
 */
export const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Catálogo', href: '/catalog' },
] as const;
