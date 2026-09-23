import { RoutePlaceholder } from '@/pages/RoutePlaceholder';

/**
 * `/store/:id` — página pública da loja, perfil do brechó (FE-US007-2, #223).
 * Pública de propósito: sem `RequireAuth`/`RequireRole` em `AppRoutes.tsx`.
 * Placeholder mínimo; a tela real substitui isto por inteiro.
 */
function SellerProfile() {
  return <RoutePlaceholder title="Perfil da loja" />;
}

export default SellerProfile;
