import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import BrandSignature from '@/components/common/BrandSignature';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import { SearchBar } from '@/components/catalog/SearchBar';
import { useAuth } from '@/context/useAuth';
import { ProductGrid } from '@/components/product/ProductGrid';
import { VintexSearchSpotlight } from '@/components/vintex-ai/VintexSearchSpotlight';
import { paths, productDetail } from '@/routes/paths';
import { getFeed } from '@/services/catalogService';
import { getPreferences, getStyles } from '@/services/preferenceService';
import { formatPieceCount } from '@/utils/format';
import type { Preference, StyleOption } from '@/types/preference';
import type { Paginated, Product } from '@/types/product';

/**
 * Termos que existem no catálogo — cada um devolve resultado tanto no mock
 * quanto na busca do back, que casa por nome, marca e categoria. Sugestão que
 * não acha nada é pior que sugestão nenhuma, ainda mais numa demonstração.
 */
const SUGGESTIONS = ['Jaqueta', 'Vestido', 'Tênis', 'Bolsa'];

/**
 * Home — abertura do produto e feed de peças.
 *
 * Decisões da revisão visual:
 *
 * - **A página abre dizendo o que a Vintex é e deixa buscar dali.** Antes
 *   abria com "Feed de achados" em 72px e a grade logo abaixo: um rótulo do
 *   tamanho de uma manchete, e nenhuma forma de buscar sem antes navegar até o
 *   catálogo. O bloco de abertura é o `VintexSearchSpotlight`, que já existia
 *   no repositório, testado e sem nenhuma tela que o usasse.
 * - **O título da página é a frase de abertura**, e "Feed de achados" desce
 *   para `h2` de seção — a ordem dos títulos passa a descrever a página.
 * - **Erro e vazio têm saída.** O erro era um `<p>` vermelho sem ação; agora
 *   oferece tentar de novo. Falha ao carregar mais não derruba o que já está
 *   na tela: vira aviso ao lado do botão.
 * - **Convite para vender (FE-US006-1, #212).** A Home logada usa o banner do
 *   Figma e oferece "Anunciar Peça" (`/sell`) a quem ainda não tem loja.
 *   Como no `Header`, a fonte é `user.is_seller`, sem requisição extra.
 */
function Home() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const showSellInvite = isAuthenticated && !user?.is_seller;
  const [searchTerm, setSearchTerm] = useState('');
  const [preferenceLabels, setPreferenceLabels] = useState<string[]>([]);
  // ponytail: Home favorites are page-local toggles until a shared favorites service exists.
  const [favorites, setFavorites] = useState<string[]>([]);
  const [feed, setFeed] = useState<Paginated<Product> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getFeed()
      .then(setFeed)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!isAuthenticated) {
      setPreferenceLabels([]);
      setFavorites([]);
      return;
    }

    let current = true;
    Promise.all([getStyles(), getPreferences()])
      .then(([styles, preferences]: [StyleOption[], Preference[]]) => {
        if (!current) return;
        setPreferenceLabels(
          preferences.map(
            (preference) =>
              styles.find((style) => style.value === preference.value)?.label ?? preference.value,
          ),
        );
      })
      .catch(() => {
        if (current) setPreferenceLabels([]);
      });

    return () => {
      current = false;
    };
  }, [isAuthenticated]);

  async function loadMore() {
    if (!feed || loading || loadingMore) return;
    setLoadingMore(true);
    setError(false);
    try {
      const next = await getFeed({ page: feed.page + 1 });
      setFeed({ ...next, items: [...feed.items, ...next.items] });
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const hasItems = Boolean(feed && feed.items.length > 0);
  const hasMore = Boolean(feed && feed.items.length < feed.total);

  function toggleFavorite(id: string) {
    setFavorites((current) =>
      current.includes(id) ? current.filter((favorite) => favorite !== id) : [...current, id],
    );
  }

  function searchCatalog(term: string) {
    const query = term.trim();
    navigate(query ? `${paths.catalog}?q=${encodeURIComponent(query)}` : paths.catalog);
  }

  function askVintex(message: string) {
    navigate(paths.vintex, { state: { message } });
  }

  return (
    <main className={isAuthenticated ? 'bg-white' : undefined}>
      <div className="tablet:hidden">
        <BrandSignature />
      </div>

      <Container className="pt-5 tablet:pt-8">
        {!isAuthenticated && (
          <div className="tablet:hidden">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              onSubmit={searchCatalog}
              placeholder="Busque por peça ou marca"
            />
          </div>
        )}

        {/* O spotlight segue como caminho de busca com IA na abertura desktop. */}
        <div className="hidden tablet:block">
          <VintexSearchSpotlight
            headingAs="h1"
            heading="Garimpe a peça certa nos brechós do Rio Grande do Sul."
            // Sem eyebrow e sem selo "Online": a assistente ainda não responde de
            // verdade, e anunciar disponibilidade que não existe é promessa que a
            // própria demonstração desmente.
            eyebrow=""
            isOnline={false}
            suggestions={SUGGESTIONS}
            placeholder="O que você procura?"
            // Enviar pelo spotlight é a via principal da IA (RN-94): leva direto
            // para a conversa já com a pergunta, não para a busca tradicional do
            // catálogo (#143 lê `location.state.message`).
            onSubmit={(query) => navigate(paths.vintex, { state: { message: query } })}
          />
        </div>
      </Container>

      {isAuthenticated && (
        <Container className="flex flex-col gap-4 pt-4 tablet:hidden">
          <div className="flex flex-col gap-1">
            <p className="font-ui text-[12px] font-bold uppercase tracking-[1.1px] text-vermelho-escuro">
              Curadoria Personalizada
            </p>
            <p className="font-ui text-body-sm text-texto-auxiliar">
              {preferenceLabels.length > 0 ? (
                <>
                  Seu perfil está afinado para{' '}
                  <strong className="font-bold text-texto-auxiliar">
                    {preferenceLabels.join(' e ')}
                  </strong>
                  . Explore as novidades da Vintex.
                </>
              ) : (
                <>
                  Escolha seus estilos para personalizar sua experiência.{' '}
                  <Link
                    to={paths.profilePreferences}
                    className="font-semibold text-vermelho-escuro underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
                  >
                    Defina suas preferências
                  </Link>
                  .
                </>
              )}
            </p>
          </div>

          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            onSubmit={searchCatalog}
            placeholder="Busque por peça, marca ou brechó..."
          />

          <div aria-label="Sugestões da Vintex" className="flex flex-wrap gap-2">
            {[
              ['Sugerir Look', 'Sugira um look para mim.'],
              ['Últimas Tendências', 'Quais são as últimas tendências?'],
              ['Achados (Raros)', 'Mostre achados raros.'],
            ].map(([label, message]) => (
              <button
                key={label}
                type="button"
                onClick={() => askVintex(message)}
                className="min-h-touch rounded-full border border-linha bg-verde-rs px-3 py-2 font-ui text-[11px] font-semibold text-branco-quente transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-branco-quente"
              >
                {label}
              </button>
            ))}
          </div>
        </Container>
      )}

      {showSellInvite ? (
        <Container as="section" aria-labelledby="vender-titulo" className="pt-6 tablet:pt-8">
          <div className="relative border border-linha bg-papel-profundo p-5 shadow-[4px_4px_0_0_#eee5d7,0_8px_16px_rgba(29,27,26,0.06)]">
            <div aria-hidden className="absolute inset-2 border border-tinta/15" />
            <div className="relative flex flex-col items-start gap-1">
              <p className="font-ui text-[10px] font-bold uppercase leading-[15.6px] text-vermelho-escuro">
                Taxa de apenas <span className="text-[12px]">9%</span> quando vender
              </p>
              <h2 id="vender-titulo" className="font-display text-h4 text-tinta">
                Venda roupas do seu armário
              </h2>
              <p className="font-ui text-body-sm text-texto-auxiliar">Anuncie em 2 minutos.</p>
              <Link
                to={paths.sell}
                className="mt-2 inline-flex min-h-touch w-full items-center justify-center border border-vermelho-escuro bg-vermelho-escuro px-3 py-2 font-ui text-label font-semibold uppercase tracking-[0.48px] text-branco-quente transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-branco-quente tablet:w-auto"
              >
                Anunciar Peça
              </Link>
            </div>
          </div>
        </Container>
      ) : null}

      <Container
        as="section"
        aria-labelledby="feed-titulo"
        aria-busy={loading || loadingMore}
        className="pt-10 tablet:pt-14"
      >
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="feed-titulo" className="font-display text-h2 text-tinta">
            {isAuthenticated ? 'Garimpados para Você' : 'Feed de achados'}
          </h2>
          {isAuthenticated ? (
            <Link
              to={paths.profilePreferences}
              className="font-ui text-label font-semibold text-vermelho-escuro underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
            >
              Editar minhas preferências
            </Link>
          ) : feed && feed.total > 0 ? (
            <p className="font-ui text-body text-texto-auxiliar">
              {formatPieceCount(feed.total)} à venda agora
            </p>
          ) : null}
        </div>

        {isAuthenticated && (
          <nav
            aria-label="Categorias de peças"
            className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1"
          >
            {[
              ['Tudo', ''],
              ['Roupas', 'Roupas'],
              ['Acessórios', 'Acessórios'],
              ['Calçados', 'Sapatos'],
            ].map(([label, query], index) => (
              <Link
                key={label}
                to={query ? `${paths.catalog}?q=${encodeURIComponent(query)}` : paths.catalog}
                className={clsx(
                  'inline-flex min-h-touch shrink-0 items-center justify-center rounded-full border px-4 py-2 font-ui text-label font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                  index === 0
                    ? 'border-verde-rs bg-verde-rs text-branco-quente hover:brightness-110 focus-visible:outline-verde-rs'
                    : 'border-linha bg-branco-quente text-tinta hover:bg-papel-profundo focus-visible:outline-vermelho-escuro',
                )}
              >
                {label}
              </Link>
            ))}
            <Link
              to={paths.catalog}
              aria-label="Abrir filtros do catálogo"
              className="inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-full border border-linha bg-branco-quente text-texto-auxiliar transition-colors hover:bg-papel-profundo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path d="M4 7h16M7 12h10m-7 5h4" stroke="currentColor" strokeWidth="1.8" />
                <path d="m17 5 2 2-2 2" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </Link>
          </nav>
        )}

        {error && !hasItems ? (
          <ErrorState message="Não foi possível carregar as peças agora." onRetry={load} />
        ) : (
          <>
            {/*
              O aviso de carregamento continua existindo para leitor de tela,
              mas sai da tela: os skeletons são `aria-hidden`, então sem ele a
              espera fica muda — e com ele visível a mesma informação aparecia
              duas vezes, como texto e como blocos.
            */}
            {(loading || loadingMore) && (
              <p role="status" className="sr-only">
                Carregando peças…
              </p>
            )}
            <ProductGrid
              products={feed?.items ?? []}
              loading={loading}
              productPath={productDetail}
              compactCards={isAuthenticated}
              onToggleFavorite={isAuthenticated ? toggleFavorite : undefined}
              isFavorite={isAuthenticated ? (id) => favorites.includes(id) : undefined}
              // Com `productPath` real, quem navega é o `<Link>` do cartão. Navegar
              // aqui também empilharia duas entradas no histórico e o "voltar" não
              // sairia da peça; `onOpen` fica como ponto de telemetria.
              onOpen={() => {}}
              emptyState={
                <EmptyState
                  title="Ainda não há peças por aqui"
                  message="Os brechós estão cadastrando o acervo. Volte em instantes ou fale com a assistente para avisarmos quando chegar algo do seu estilo."
                />
              }
            />
          </>
        )}

        {hasMore && (
          <div className="mt-8 flex flex-col items-center gap-3">
            {error && hasItems ? (
              <p role="alert" className="font-ui text-body-sm text-vermelho-escuro">
                Não foi possível carregar mais peças. Tente de novo.
              </p>
            ) : null}
            <Button
              variant="secondary"
              disabled={loading || loadingMore}
              onClick={loadMore}
              className="min-w-56"
            >
              {loadingMore ? 'Carregando…' : 'Carregar mais achados'}
            </Button>
          </div>
        )}
      </Container>
    </main>
  );
}

export default Home;
