import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import ErrorState from '@/components/common/ErrorState';
import { useAuth } from '@/context/useAuth';
import { useToast } from '@/context/useToast';
import { useMyStore } from '@/hooks/useMyStore';
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
 * `RequireStore` (FE-US006-2, #213, RN-31 "não se anuncia sem loja") protege
 * a área do vendedor (`/seller/*`): também parte do `RequireAuth`, mas em vez
 * do papel consulta a loja (`getMyStore`). Sem loja, leva a `paths.sell` com
 * um toast explicando o motivo — em vez da home muda do `RequireRole`.
 *
 * Usage:
 *   <Route path={paths.onboarding} element={<RequireAuth><Onboarding /></RequireAuth>} />
 *   <Route path={paths.admin} element={<RequireRole role="admin"><Admin /></RequireRole>} />
 *   <Route path={paths.seller} element={<RequireStore><SellerAdmin /></RequireStore>} />
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

const NO_STORE_MESSAGE = 'Para anunciar, crie sua loja';

function StoreGate({ children }: { children: ReactNode }) {
  const { state, retry } = useMyStore();
  const { toast } = useToast();
  const hasNoStore = state.status === 'ready' && state.store === null;

  // Efeito, não render: disparar o toast durante o render o repetiria a cada
  // nova renderização. Só vira `true` uma vez por montagem (vem de um update,
  // não do mount), então o StrictMode não o duplica.
  useEffect(() => {
    if (hasNoStore) {
      toast(NO_STORE_MESSAGE, { kind: 'info' });
    }
  }, [hasNoStore, toast]);

  if (state.status === 'loading') {
    return (
      <p role="status" className="px-4 py-12 text-center font-ui text-body text-texto-auxiliar">
        Verificando sua loja…
      </p>
    );
  }

  if (state.status === 'error') {
    return <ErrorState message="Não foi possível verificar sua loja." onRetry={retry} />;
  }

  if (hasNoStore) {
    return <Navigate to={paths.sell} replace />;
  }

  return <>{children}</>;
}

export function RequireStore({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <StoreGate>{children}</StoreGate>
    </RequireAuth>
  );
}
