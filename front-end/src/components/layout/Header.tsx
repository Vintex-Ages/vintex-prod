import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import logoVintex from '@/assets/images/logo-vintex.svg';
import { SearchBar } from '@/components/catalog/SearchBar';
import { useAuth } from '@/context/useAuth';
import { useCart } from '@/context/useCart';
import { paths } from '@/routes/paths';
import backIcon from '@/assets/product-detail/back.svg';
import shareIcon from '@/assets/product-detail/share.svg';
import { AccountButton } from './AccountButton';
import { AccountMenu } from './AccountMenu';
import CartBadge from './CartBadge';
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
 * - **A navegação permanece acessível em todo tamanho de tela.** Abaixo de
 *   `tablet`, Home e Catálogo ficam em um menu compacto para preservar uma
 *   única linha com marca, carrinho e conta. A partir de `tablet`, os links
 *   voltam a aparecer diretamente na barra.
 * - **Busca no cabeçalho.** "Comprar" é a prioridade declarada da stakeholder
 *   e a busca só existia dentro de `/catalog`. Agora ela parte de qualquer
 *   tela e escreve o termo na URL (`/catalog?q=`), então o resultado tem
 *   endereço próprio e o "voltar" do navegador funciona.
 * - **Fixo no topo.** O feed é longo; sem isso a busca e a conta saem de
 *   alcance depois da primeira rolagem.
 * - **Itens de vendedor (FE-US006-2, #213).** Logado sem loja, o menu oferece
 *   "Quero vender"; com loja, "Minha loja" e "Anunciar peça". A fonte é
 *   `user.is_seller` do contexto — síncrono, sem requisição no header — e o
 *   menu troca sozinho quando alguém chama `refreshUser()` (a tela de criar
 *   loja, #212). Limitação conhecida: na API real, `login`/`register` não
 *   trazem `is_seller`, então logo após entrar o vendedor aparece sem loja
 *   até o próximo `refreshUser()`.
 *
 * Usage:
 *   import Header from '@/components/layout/Header';
 *   <Header />
 */
function Header() {
  const [open, setOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [term, setTerm] = useState('');
  const mobileSearchToggleRef = useRef<HTMLButtonElement>(null);
  const mobileSearchRegionRef = useRef<HTMLDivElement>(null);
  const { user, isAuthenticated, logout } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;

  // O Header é montado pela rota-pai e não remonta quando a rota filha troca.
  // Sem isto, abrir "Conta" e clicar em Home ou Catálogo levava o menu aberto
  // junto, cobrindo a página nova.
  useEffect(() => {
    setOpen(false);
    setMobileNavOpen(false);
    setMobileSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileSearchOpen) return;
    mobileSearchRegionRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  }, [mobileSearchOpen]);

  // Escape fecha, como já faz o LoginInterceptor do projeto.
  useEffect(() => {
    if (!open && !mobileNavOpen && !mobileSearchOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (mobileSearchOpen) mobileSearchToggleRef.current?.focus();
        setOpen(false);
        setMobileNavOpen(false);
        setMobileSearchOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileNavOpen, mobileSearchOpen, open]);

  function handleSearch(value: string) {
    const trimmed = value.trim();
    setMobileSearchOpen(false);
    navigate(trimmed ? `${paths.catalog}?q=${encodeURIComponent(trimmed)}` : paths.catalog);
  }

  function goTo(path: string) {
    setOpen(false);
    navigate(path);
  }

  function handleBack() {
    if (location.key === 'default') navigate(paths.home);
    else navigate(-1);
  }

  async function shareProduct() {
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url: window.location.href });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }

  const accountItems = [
    ...(user?.is_seller
      ? [
          { label: 'Minha loja', onSelect: () => goTo(paths.seller) },
          { label: 'Anunciar peça', onSelect: () => goTo(paths.sellerProductNew) },
        ]
      : [{ label: 'Quero vender', onSelect: () => goTo(paths.sell) }]),
    // Edição das preferências no perfil (FE-US004-3, #72): vale para todo
    // usuário logado, vendedor ou não.
    {
      label: 'Meus Estilos & Preferências da IA',
      onSelect: () => goTo(paths.profilePreferences),
    },
  ];

  /** Rotas que já oferecem a busca em tamanho grande — ver o comentário no JSX. */
  const showSearch = pathname !== paths.home && pathname !== paths.catalog;

  if (pathname.startsWith('/product/')) {
    return (
      <header className="sticky top-0 z-30 h-[68px] border-b border-linha bg-papel/95 backdrop-blur-sm">
        <Container className="flex h-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              aria-label="Voltar"
              onClick={handleBack}
              className="flex size-11 shrink-0 items-center justify-center border border-linha bg-papel text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
            >
              <img src={backIcon} alt="" />
            </button>
            <Link
              to={paths.home}
              aria-label="Vintex"
              className="shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-vermelho-escuro"
            >
              <img src={logoVintex} alt="Vintex" className="block h-5 w-auto" />
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Compartilhar produto"
              onClick={() => void shareProduct()}
              className="flex size-11 items-center justify-center border border-linha bg-papel text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
            >
              <img src={shareIcon} alt="" />
            </button>
            <Link
              to={paths.cart}
              className="flex min-h-11 items-center justify-center border border-linha bg-branco-quente px-3 font-ui text-label font-semibold uppercase tracking-wide text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
            >
              Sacola ({count})
            </Link>
          </div>
        </Container>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-linha bg-papel">
      <Container className="flex items-center gap-1 py-3 tablet:gap-6 tablet:py-4">
        <Link
          to={paths.home}
          className="shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-vermelho-escuro"
        >
          <img src={logoVintex} alt="Vintex" className="block h-5 w-auto" />
        </Link>

        {showSearch ? (
          <div className="relative shrink-0 tablet:hidden">
            <button
              type="button"
              aria-label={mobileNavOpen ? 'Fechar menu principal' : 'Abrir menu principal'}
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-primary-navigation"
              onClick={() => {
                setMobileNavOpen((value) => !value);
                setOpen(false);
                setMobileSearchOpen(false);
              }}
              className="inline-flex min-h-touch min-w-touch items-center justify-center text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                {mobileNavOpen ? (
                  <>
                    <path d="m6 6 12 12" />
                    <path d="m18 6-12 12" />
                  </>
                ) : (
                  <>
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h16" />
                  </>
                )}
              </svg>
            </button>

            {mobileNavOpen ? (
              <nav
                id="mobile-primary-navigation"
                aria-label="Principal mobile"
                className="absolute left-0 top-full z-10 mt-2 min-w-40 border border-linha bg-branco-quente p-2"
              >
                <ul>
                  {NAV_LINKS.map((link) => (
                    <li key={link.href}>
                      <NavLink
                        to={link.href}
                        end={link.href === paths.home}
                        onClick={() => setMobileNavOpen(false)}
                        className={({ isActive }) =>
                          [
                            'flex min-h-touch items-center px-3 font-ui text-body text-tinta transition-colors',
                            'hover:bg-papel-profundo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-tinta',
                            isActive ? 'underline decoration-2 underline-offset-4' : 'no-underline',
                          ].join(' ')
                        }
                      >
                        {link.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>
        ) : null}

        {showSearch ? (
          <button
            ref={mobileSearchToggleRef}
            type="button"
            aria-label="Buscar"
            aria-expanded={mobileSearchOpen}
            aria-controls="mobile-header-search"
            onClick={() => {
              setMobileSearchOpen((value) => !value);
              setMobileNavOpen(false);
              setOpen(false);
            }}
            className="inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center text-tinta transition-colors hover:bg-papel-profundo focus:outline-none focus-visible:ring-2 focus-visible:ring-tinta tablet:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
          </button>
        ) : null}

        <nav aria-label="Principal" className="hidden shrink-0 items-center gap-6 tablet:flex">
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
          No mobile, a lupa expande o campo em uma faixa própria. Os controles
          mobile somem nas rotas Home e Catálogo, que já oferecem busca própria;
          nas outras rotas, menu e busca permanecem disponíveis.

          Nas rotas que já têm a própria busca em tamanho grande (a abertura da
          home e o catálogo), a versão desktop do cabeçalho não aparece: eram
          dois campos idênticos empilhados a 300px um do outro, e o de cima
          competia com o que a página oferece como ação principal.
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

        <div className="relative ml-auto flex shrink-0 items-center gap-1 tablet:ml-0 tablet:gap-2">
          {isAuthenticated ? (
            <CartBadge count={count} onClick={() => navigate(paths.cart)} />
          ) : null}

          <div className="[&_button]:min-w-touch [&_button]:px-2 [&_span]:sr-only [&_svg:last-child]:hidden tablet:[&_button]:px-3 tablet:[&_span]:not-sr-only tablet:[&_svg:last-child]:block">
            <AccountButton
              label={isAuthenticated ? (user?.name ?? 'Conta') : 'Conta'}
              open={open}
              onClick={() => {
                setOpen((value) => !value);
                setMobileNavOpen(false);
                setMobileSearchOpen(false);
              }}
            />
          </div>

          {open && (
            <div className="absolute right-0 top-full z-10 mt-2">
              <AccountMenu
                authenticated={isAuthenticated}
                user={isAuthenticated ? { name: user?.name ?? '' } : undefined}
                items={accountItems}
                onLogin={() => goTo(paths.login)}
                onRegister={() => goTo(paths.register)}
                onLogout={() => {
                  setOpen(false);
                  logout();
                }}
              />
            </div>
          )}
        </div>
      </Container>

      {mobileSearchOpen ? (
        <div
          ref={mobileSearchRegionRef}
          id="mobile-header-search"
          className="border-t border-linha tablet:hidden"
        >
          <Container className="py-3">
            <SearchBar value={term} onChange={setTerm} onSubmit={handleSearch} />
          </Container>
        </div>
      ) : null}
    </header>
  );
}

export default Header;
