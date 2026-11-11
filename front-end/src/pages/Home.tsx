
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import BrandSignature from '@/components/common/BrandSignature';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import { SearchBar } from '@/components/catalog/SearchBar';
import { CATEGORIES } from '@/components/catalog/categories';
import { FilterChip } from '@/components/catalog/FilterChip';
import FilterToggle from '@/components/catalog/FilterToggle';
import { useAuth } from '@/context/useAuth';
import { useFavorites } from '@/context/useFavorites';
import { ProductGrid } from '@/components/product/ProductGrid';
import { VintexSearchSpotlight } from '@/components/vintex-ai/VintexSearchSpotlight';
import { useHomeFeed } from '@/hooks/useHomeFeed';
import { paths, productDetail } from '@/routes/paths';
import { getPreferences, getStyles } from '@/services/preferenceService';
import { formatPieceCount } from '@/utils/format';
import type { Preference, StyleOption } from '@/types/preference';

const SUGGESTIONS = ['Jaqueta', 'Vestido', 'Tênis', 'Bolsa'];

const VINTEX_SUGGESTIONS = [
  'Blazer de lã',
  'Jeans anos 90',
  'Camisa de seda',
];

function Home() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const showSellInvite = isAuthenticated && !user?.is_seller;
  const firstName = user?.name?.trim().split(/\s+/)[0] || '';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [preferenceLabels, setPreferenceLabels] = useState<string[]>([]);

  const { ids: favoriteIds, toggle: toggleFavorite } = useFavorites();

  const {
    feed,
    loading,
    loadingMore,
    error,
    hasItems,
    hasMore,
    loadMore,
    reload: load,
  } = useHomeFeed(isAuthenticated, selectedCategory);

  useEffect(() => {
    if (!isAuthenticated) {
      setPreferenceLabels([]);
      return;
    }

    let current = true;

    Promise.all([getStyles(), getPreferences()])
      .then(([styles, preferences]: [StyleOption[], Preference[]]) => {
        if (!current) return;

        setPreferenceLabels(
          preferences
            .filter((preference) => preference.type === 'estilo')
            .map((preference) =>
              styles.find((style) => style.value === preference.value)?.label,
            )
            .filter((label): label is string => Boolean(label)),
        );
      })
      .catch(() => {
        if (current) setPreferenceLabels([]);
      });

    return () => {
      current = false;
    };
  }, [isAuthenticated]);

  function handleToggleFavorite(id: string) {
    void toggleFavorite(id).catch(() => {
      // O contexto já desfaz a alteração quando ocorre uma falha.
    });
  }

  function searchCatalog(term: string) {
    const query = term.trim();

    navigate(
      query
        ? `${paths.catalog}?q=${encodeURIComponent(query)}`
        : paths.catalog,
    );
  }

  function askVintex(message: string) {
    navigate(paths.vintex, { state: { message } });
  }

  return (
    <main className={isAuthenticated ? 'bg-branco-quente' : undefined}>
      {!isAuthenticated ? (
        <Container className="flex flex-col gap-4 pt-6 pb-0 tablet:gap-6 tablet:py-8">
          <div className="-mx-4 -mt-6 tablet:hidden">
            <BrandSignature headingAs="p" />
          </div>

          <div className="tablet:hidden">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              onSubmit={searchCatalog}
            />
          </div>

          <nav
            aria-label="Categorias de peças"
            className="-mx-4 flex flex-nowrap items-center gap-2 overflow-x-auto px-4 hide-scrollbar tablet:hidden"
          >
            {CATEGORIES.map(({ label, value }) => (
              <FilterChip
                key={label}
                label={label}
                active={selectedCategory === value}
                onToggle={() => setSelectedCategory(value)}
              />
            ))}

            <FilterToggle onClick={() => navigate(paths.catalog)} />
          </nav>

          <div className="hidden tablet:block">
            <VintexSearchSpotlight
              headingAs="h1"
              heading="Garimpe a peça certa nos brechós do Rio Grande do Sul."
              eyebrow=""
              isOnline={false}
              suggestions={SUGGESTIONS}
              placeholder="O que você procura?"
              onSubmit={askVintex}
            />
          </div>
        </Container>
      ) : (
        <>
          {/* Saudação e curadoria personalizada */}
          <Container className="pt-8 pb-0 tablet:pt-12 web:pt-16">
            <section aria-labelledby="home-saudacao">
              <p className="mb-3 font-ui text-[11px] font-bold uppercase tracking-[1.6px] text-vermelho-escuro">
                Curadoria personalizada
              </p>

              <h1
                id="home-saudacao"
                className="max-w-4xl font-display text-[38px] leading-[1.12] tracking-[-1px] text-tinta tablet:text-[52px] web:text-[64px]"
              >
                Olá{firstName ? `, ${firstName}` : ''}.
                <span className="block">
                  Novos achados do seu estilo.
                </span>
              </h1>

              <div className="mt-4 max-w-2xl font-ui text-body-sm leading-relaxed text-texto-auxiliar tablet:text-body">
                {preferenceLabels.length > 0 ? (
                  <p>
                    Seu estilo está calibrado para{' '}
                    <strong className="font-semibold text-tinta">
                      {preferenceLabels.join(' e ')}
                    </strong>
                    . Explore as peças selecionadas para você.
                  </p>
                ) : (
                  <p>
                    Escolha seus estilos para receber uma curadoria
                    personalizada.{' '}
                    <Link
                      to={paths.profilePreferences}
                      className="font-semibold text-vermelho-escuro underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro"
                    >
                      Defina suas preferências
                    </Link>
                    .
                  </p>
                )}
              </div>
            </section>
          </Container>

          {/* Convite exclusivo para quem ainda não possui brechó */}
          {showSellInvite && (
            <Container
              as="section"
              aria-labelledby="vender-titulo"
              className="pt-8 tablet:pt-10"
            >
              <div className="border border-linha bg-papel-profundo px-5 py-7 tablet:px-9 tablet:py-9">
                <div className="flex flex-col items-start gap-4 tablet:flex-row tablet:items-center tablet:justify-between tablet:gap-8">
                  <div className="max-w-2xl">
                    <p className="mb-3 font-ui text-[10px] font-bold uppercase tracking-[1.5px] text-vermelho-escuro">
                      Inscrição liberada
                    </p>

                    <h2
                      id="vender-titulo"
                      className="font-display text-[29px] leading-tight text-tinta tablet:text-[38px]"
                    >
                      Cadastre seu brechó para vender
                    </h2>

                    <p className="mt-3 font-ui text-body-sm leading-relaxed text-texto-auxiliar">
                      Transforme suas peças em novos achados.
                      Cadastre seu brechó e pague apenas 9%
                      de comissão quando vender.
                    </p>
                  </div>

                  <Link
                    to={paths.sell}
                    className="inline-flex min-h-touch w-full shrink-0 items-center justify-center border border-vermelho-escuro bg-vermelho-escuro px-6 py-3 font-ui text-label font-semibold uppercase tracking-[0.7px] text-branco-quente transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermelho-escuro tablet:w-auto"
                  >
                    Criar meu brechó
                  </Link>
                </div>
              </div>
            </Container>
          )}

          {/* Assistente Vintex: mesmo componente no mobile e desktop */}
          <Container
            as="section"
            aria-label="Assistente Vintex"
            className="pt-8 tablet:pt-10"
          >
            <VintexSearchSpotlight
              headingAs="h2"
              eyebrow="IA Curadora • Vintex"
              heading="O que você procura hoje no RS?"
              placeholder="Descreva a peça ou estilo..."
              suggestions={VINTEX_SUGGESTIONS}
              isOnline={false}
              onSubmit={askVintex}
            />
          </Container>
        </>
      )}

      {/* Feed existente: preserva recomendações e paginação */}
      <Container
        as="section"
        aria-labelledby="feed-titulo"
        aria-busy={loading || loadingMore}
        className={
          isAuthenticated
            ? 'pt-10 pb-12 tablet:pt-14'
            : 'pt-4 tablet:pt-14'
        }
      >
        <div
          className={clsx(
            'mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1',
            !isAuthenticated &&
              'mb-[17.6px] flex-col items-start gap-[7.9px] border-b-[0.8px] border-tinta pb-4 tablet:mb-6 tablet:flex-row tablet:items-baseline tablet:gap-y-1 tablet:border-b-0 tablet:pb-0',
          )}
        >
          <h2
            id="feed-titulo"
            className={clsx(
              'font-display text-h2 text-tinta',
              !isAuthenticated &&
                'text-[30.8px] font-semibold leading-[30.8px] tracking-[-1.232px] tablet:text-h2 tablet:leading-[1.05] tablet:tracking-normal',
            )}
          >
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
            <p className="hidden font-ui text-body-sm text-texto-auxiliar tablet:block">
              {formatPieceCount(feed.total)} à venda agora
            </p>
          ) : null}

          {!isAuthenticated && feed && feed.total > 0 ? (
            <p className="font-ui text-[12px] leading-normal text-texto-auxiliar tablet:hidden">
              {formatPieceCount(feed.total)} encontradas
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
                to={
                  query
                    ? `${paths.catalog}?q=${encodeURIComponent(query)}`
                    : paths.catalog
                }
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
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
              >
                <path
                  d="M4 7h16M7 12h10m-7 5h4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="m17 5 2 2-2 2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
            </Link>
          </nav>
        )}

        {error && !hasItems ? (
          <ErrorState
            message="Não foi possível carregar as peças agora."
            onRetry={load}
          />
        ) : (
          <>
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
              onToggleFavorite={
                isAuthenticated ? handleToggleFavorite : undefined
              }
              isFavorite={
                isAuthenticated
                  ? (id) => favoriteIds.has(id)
                  : undefined
              }
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
              <p
                role="alert"
                className="font-ui text-body-sm text-vermelho-escuro"
              >
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
