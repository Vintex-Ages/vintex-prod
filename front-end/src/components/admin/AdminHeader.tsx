import { Link } from 'react-router-dom';
import logo from '@/assets/images/logo-vintex.svg';
import { useAuth } from '@/context/useAuth';
import { paths } from '@/routes/paths';

/**
 * Cabeçalho da área administrativa (FE-US032-1), como no Figma.
 *
 * - **Celular:** barra clara com a marca (volta à home) e o avatar com as
 *   iniciais de quem está logado.
 * - **Tablet e web:** barra vermelha com a marca, o rótulo "Painel
 *   administrativo" e o nome de quem está logado.
 * - **Abaixo, em ambos:** a única aba por ora, "Comprovantes" (as demais abas
 *   do Figma ficam fora do escopo).
 *
 * Precisa estar dentro do `AuthProvider`. Sem regra de negócio.
 *
 * Usage:
 *   import { AdminHeader } from '@/components/admin/AdminHeader';
 *   <AdminHeader />
 */

/** "Eva Vieira" → "EV"; "Cris" → "C". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return `${first}${last}`.toUpperCase();
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20c0-4 2.8-6.5 6.5-6.5s6.5 2.5 6.5 6.5" />
    </svg>
  );
}

export function AdminHeader() {
  const { user } = useAuth();

  return (
    <header>
      <div className="bg-papel-profundo tablet:bg-vermelhao">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-6 px-4 py-3.5 tablet:h-20 tablet:px-10 tablet:py-0 web:px-20">
          <div className="flex items-center gap-5">
            <Link
              to={paths.home}
              aria-label="Vintex — ir para a página inicial"
              className="inline-flex min-h-touch items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta tablet:focus-visible:ring-branco-quente"
            >
              <img
                src={logo}
                alt=""
                className="h-5 w-auto tablet:h-8 tablet:brightness-0 tablet:invert"
              />
            </Link>

            <span aria-hidden="true" className="hidden h-6 w-px bg-branco-quente/30 tablet:block" />
            <span className="hidden font-ui text-label font-bold uppercase tracking-wide text-branco-quente/85 tablet:block">
              Painel administrativo
            </span>
          </div>

          {user ? (
            <>
              <span
                data-testid="admin-avatar"
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-vermelho-escuro font-ui text-label font-bold text-branco-quente tablet:hidden"
              >
                {initials(user.name)}
              </span>
              <span
                data-testid="admin-account"
                className="hidden items-center gap-2 font-ui text-label font-semibold uppercase tracking-wide text-branco-quente tablet:inline-flex"
              >
                <UserIcon />
                {user.name}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <nav
        aria-label="Área administrativa"
        className="border-b border-linha bg-papel tablet:bg-branco-quente"
      >
        <div className="mx-auto flex w-full max-w-[1440px] px-4 tablet:px-10 web:px-20">
          <Link
            to={paths.adminReceipts}
            aria-current="page"
            className="inline-flex min-h-touch items-center border-b-2 border-vermelho-escuro px-1 font-ui text-body-sm font-semibold text-tinta focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta tablet:border-vermelhao"
          >
            Comprovantes
          </Link>
        </div>
      </nav>
    </header>
  );
}
