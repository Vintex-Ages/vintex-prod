import { paths } from '@/routes/paths';

/**
 * Navegação principal, compartilhada entre `Header` e `Footer`.
 * Os destinos saem de `paths` para não duplicar string de rota. O router
 * está montado desde #106, então quem consome renderiza `<Link to={href}>`.
 */
export const NAV_LINKS = [
  { label: 'Home', href: paths.home },
  { label: 'Catálogo', href: paths.catalog },
] as const;
