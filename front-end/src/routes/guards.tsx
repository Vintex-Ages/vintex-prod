import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';
import { paths } from './paths';

/**
 * Guardas de rota (FE-US005-3, #75): `RequireAuth` exige sessão ativa e
 * `RequireRole` exige, além da sessão, um dos três papéis suportados —
 * `buyer`, `seller` ou `admin`.
 *
 * `RequireRole` reaproveita `RequireAuth` por composição: primeiro garante a
 * sessão (senão redireciona a `paths.login`), depois checa o papel. Sem
 * sessão, o papel exigido não é sequer avaliado.
 *
 * Quando o usuário está autenticado mas não tem o papel exigido, o redirect
 * vai para `paths.home` — não existe página de "acesso negado" no design
 * system ainda; isso é suposição a reavaliar se isso mudar.
 *
 * Usage:
 *   <Route path={paths.onboarding} element={<RequireAuth><Onboarding /></RequireAuth>} />
 *   <Route path={paths.sellerDashboard} element={<RequireRole role="seller"><SellerDashboard /></RequireRole>} />
 */

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={paths.login}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <>{children}</>;
}

type Role = 'buyer' | 'seller' | 'admin';

function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();

  const hasRole =
    role === 'admin' ? !!user?.is_admin : role === 'seller' ? !!user?.is_seller : true;

  if (!hasRole) {
    return <Navigate to={paths.home} replace />;
  }

  return <>{children}</>;
}

export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <RequireAuth>
      <RoleGate role={role}>{children}</RoleGate>
    </RequireAuth>
  );
}
