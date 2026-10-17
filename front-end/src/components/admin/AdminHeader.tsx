import { Link } from 'react-router-dom';
import logo from '@/assets/images/logo-vintex.svg';
import { paths } from '@/routes/paths';

/**
 * Cabeçalho da área administrativa (FE-US032-1): marca que volta à home e a
 * única aba por ora, "Comprovantes" (as demais abas do Figma ficam fora do
 * escopo). Sem regra de negócio.
 *
 * Usage:
 *   import { AdminHeader } from '@/components/admin/AdminHeader';
 *   <AdminHeader />
 */
export function AdminHeader() {
  return (
    <header className="bg-vermelhao">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-4 py-3 tablet:px-6 web:px-8">
        <Link
          to={paths.home}
          aria-label="Vintex — ir para a página inicial"
          className="inline-flex min-h-touch items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-branco-quente"
        >
          <img src={logo} alt="" className="h-8 w-auto brightness-0 invert" />
        </Link>

        <nav aria-label="Área administrativa">
          <Link
            to={paths.adminReceipts}
            aria-current="page"
            className="inline-flex min-h-touch items-center border-b-2 border-branco-quente px-2 font-ui text-label font-bold uppercase tracking-wide text-branco-quente focus:outline-none focus-visible:ring-2 focus-visible:ring-branco-quente"
          >
            Comprovantes
          </Link>
        </nav>
      </div>
    </header>
  );
}
