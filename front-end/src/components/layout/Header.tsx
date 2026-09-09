import { NAV_LINKS } from './navLinks';

const ACCOUNT_LINKS = [
  { label: 'Entrar', href: '/login' },
  { label: 'Criar conta', href: '/register' },
] as const;

/**
 * Cabeçalho do app — marca, navegação principal e área de conta.
 * Composição pura sobre tokens; sem regra de negócio.
 * Links usam `<a>` porque o router ainda não está montado (#106); trocar por
 * `<Link to={paths.x}>` quando a rota entrar, sem mudar a estrutura.
 *
 * Usage:
 *   import Header from '@/components/layout/Header';
 *   <Header />
 */
function Header() {
  return (
    <header className="border-b border-linha bg-papel">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <a
          href="/"
          className="font-display text-h2 text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
        >
          vintex
        </a>

        <nav aria-label="Principal" className="hidden gap-6 tablet:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-ui text-body text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          {ACCOUNT_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-ui text-body text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </header>
  );
}

export default Header;
