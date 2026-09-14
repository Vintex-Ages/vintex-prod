import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/useAuth';
import { paths } from '@/routes/paths';
import { AccountButton } from './AccountButton';
import { AccountMenu } from './AccountMenu';
import { NAV_LINKS } from './navLinks';

/**
 * Cabeçalho do app — marca, navegação principal e área de conta.
 * Marca e navegação são composição pura sobre tokens, sem regra de negócio.
 * A área de conta é dinâmica: reage a `useAuth()` para mostrar o botão
 * "Conta" (anônimo) ou o nome do usuário (logado), abrindo um `AccountMenu`
 * com as ações correspondentes. Por isso precisa estar dentro de um
 * `<AuthProvider>` e de um `<Router>` (usa `useAuth` e `useNavigate`).
 *
 * Usage:
 *   import Header from '@/components/layout/Header';
 *   <Header />
 */
function Header() {
  const [open, setOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // O Header é montado pela rota-pai e não remonta quando a rota filha troca.
  // Sem isto, abrir "Conta" e clicar em Home ou Catálogo levava o menu aberto
  // junto, cobrindo a página nova.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape fecha, como já faz o LoginInterceptor do projeto.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <header className="border-b border-linha bg-papel">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link
          to={paths.home}
          className="font-display text-h2 text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
        >
          vintex
        </Link>

        <nav aria-label="Principal" className="hidden gap-6 tablet:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className="font-ui text-body text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="relative">
          <AccountButton
            label={isAuthenticated ? (user?.name ?? 'Conta') : 'Conta'}
            open={open}
            onClick={() => setOpen((v) => !v)}
          />

          {open && (
            <div className="absolute right-0 top-full z-10 mt-2">
              <AccountMenu
                authenticated={isAuthenticated}
                user={isAuthenticated ? { name: user?.name ?? '' } : undefined}
                onLogin={() => {
                  setOpen(false);
                  navigate(paths.login);
                }}
                onRegister={() => {
                  setOpen(false);
                  navigate(paths.register);
                }}
                onLogout={() => {
                  setOpen(false);
                  logout();
                }}
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
