import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SearchBar } from '@/components/catalog/SearchBar';
import { useAuth } from '@/context/useAuth';
import { paths } from '@/routes/paths';
import { AccountButton } from './AccountButton';
import { AccountMenu } from './AccountMenu';
import Container from './Container';
import { NAV_LINKS } from './navLinks';

/**
 * Cabeçalho do app — marca, navegação principal, busca e área de conta.
 * A área de conta é dinâmica: reage a `useAuth()` para mostrar o botão "Conta"
 * (anônimo) ou o nome do usuário (logado), abrindo um `AccountMenu` com as
 * ações correspondentes. Por isso precisa estar dentro de um `<AuthProvider>`
 * e de um `<Router>`.
 *
 * Decisões da revisão visual:
 *
 * - **A marca deixa de ser um título.** Estava em `text-h2` (48px), que num
 *   aparelho de 390px consumia a largura toda e foi o motivo de a navegação
 *   ficar escondida abaixo de `tablet`. Em `text-h3` a marca continua sendo a
 *   voz editorial (Fraunces, minúscula) e sobra espaço para o resto.
 * - **A navegação aparece em todo tamanho de tela.** Eram dois links; abaixo
 *   de 720px eles simplesmente sumiam e o catálogo só era alcançável pelo
 *   rodapé. Dois links cabem — um menu sanfonado aqui seria complexidade sem
 *   motivo.
 * - **Busca no cabeçalho.** "Comprar" é a prioridade declarada da stakeholder
 *   e a busca só existia dentro de `/catalog`. Agora ela parte de qualquer
 *   tela e escreve o termo na URL (`/catalog?q=`), então o resultado tem
 *   endereço próprio e o "voltar" do navegador funciona.
 * - **Fixo no topo.** O feed é longo; sem isso a busca e a conta saem de
 *   alcance depois da primeira rolagem.
 *
 * Usage:
 *   import Header from '@/components/layout/Header';
 *   <Header />
 */
function Header() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
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

  function handleSearch(value: string) {
    const trimmed = value.trim();
    navigate(trimmed ? `${paths.catalog}?q=${encodeURIComponent(trimmed)}` : paths.catalog);
  }

  /** Rotas que já oferecem a busca em tamanho grande — ver o comentário no JSX. */
  const showSearch = pathname !== paths.home && pathname !== paths.catalog;

  return (
    <header className="sticky top-0 z-30 border-b border-linha bg-papel">
      <Container className="flex items-center gap-4 py-3 tablet:gap-6 tablet:py-4">
        <Link
          to={paths.home}
          className="shrink-0 font-display text-h3 leading-none text-tinta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-vermelho-escuro"
        >
          vintex
        </Link>

        <nav aria-label="Principal" className="flex shrink-0 items-center gap-4 tablet:gap-6">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              end={link.href === paths.home}
              className={({ isActive }) =>
                [
                  'inline-flex min-h-touch items-center font-ui text-body-sm text-tinta transition-colors tablet:text-body',
                  'hover:text-vermelho-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-vermelho-escuro',
                  // A rota atual fica sublinhada em vez de mudar de cor: a
                  // paleta não tem um tom de "ativo" que não seja a cor de ação.
                  isActive ? 'underline decoration-2 underline-offset-8' : 'no-underline',
                ].join(' ')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/*
          A busca ocupa o espaço que sobra entre a navegação e a conta. Abaixo
          de `tablet` ela sai da barra: com 390px o campo ficaria menor que o
          próprio placeholder — nesse tamanho quem busca entra pelo catálogo,
          que abre com a barra inteira no topo.

          Nas rotas que já têm a própria busca em tamanho grande (a abertura da
          home e o catálogo), a do cabeçalho não aparece: eram dois campos
          idênticos empilhados a 300px um do outro, e o de cima competia com o
          que a página oferece como ação principal.
        */}
        {showSearch ? (
          <div className="hidden min-w-0 flex-1 justify-center tablet:flex">
            <div className="w-full max-w-md">
              <SearchBar
                value={term}
                onChange={setTerm}
                onSubmit={handleSearch}
                size="sm"
                placeholder="Busque por peça, marca ou brechó…"
              />
            </div>
          </div>
        ) : (
          <div className="hidden flex-1 tablet:block" />
        )}

        <div className="relative ml-auto shrink-0 tablet:ml-0">
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
      </Container>
    </header>
  );
}

export default Header;
