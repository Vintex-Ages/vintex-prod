import { type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import StoreCard from '@/components/store/StoreCard';
import { useStoreSearch } from '@/hooks/useStoreSearch';
import { paths, storeProfile } from '@/routes/paths';
import { toCatalogSearch } from '@/utils/catalogQuery';

/**
 * "Brechós do RS" (FE-US011-1, #330) em `/stores`, rota pública e com
 * "Brechós" no cabeçalho (FE-FND-6). Lista brechós — não peças — e a busca
 * casa só o nome da loja (RN-42, back-end#256): campo com debounce, cartão de
 * cada brechó com prévia de até duas peças e, sem resultado, o convite para
 * buscar peças com o mesmo termo no catálogo.
 *
 * Fora do escopo, por decisão da issue: nota, "Seguir", distância, "Criar meu
 * brechó" no topo e chips de região (dependem de contagem por cidade que o
 * back não tem).
 *
 * Só apresentação: busca, debounce, páginas e prévias vêm de `useStoreSearch`;
 * o clique no cartão abre o perfil da loja (`/store/:id`, #223).
 *
 * Usage:
 *   <Route path={paths.stores} element={<Stores />} />
 */
function Stores() {
  const navigate = useNavigate();
  const {
    term,
    setTerm,
    query,
    state,
    previews,
    hasMore,
    loadingMore,
    loadMoreError,
    loadMore,
    retry,
    submitTerm,
  } = useStoreSearch();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Só Enter: a busca é automática (debounce), o submit antecipa a consulta.
    event.preventDefault();
    submitTerm();
  }

  function content() {
    if (state.status === 'loading') return <StoresSkeleton />;

    if (state.status === 'error') {
      return <ErrorState message="Não foi possível carregar os brechós agora." onRetry={retry} />;
    }

    if (state.stores.length === 0) {
      return (
        <EmptyState
          title={query ? 'Nenhum brechó com esse nome' : 'Nenhum brechó por aqui ainda'}
          message={
            query
              ? `Não achamos nenhum brechó chamado "${query}". Tente outro nome ou busque peças com esse termo no catálogo.`
              : 'Os brechós estão chegando. Enquanto isso, veja as peças disponíveis no catálogo.'
          }
          action={
            <Link
              to={`${paths.catalog}${toCatalogSearch({ q: query })}`}
              className="inline-flex min-h-11 items-center justify-center border border-vermelho-escuro bg-vermelho-escuro px-6 text-body font-semibold text-branco-quente transition hover:brightness-110 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
            >
              Buscar peças no catálogo
            </Link>
          }
        />
      );
    }

    return (
      <>
        {/* Total anunciado sem poluir a tela: a busca é ao vivo, o leitor de tela precisa do retorno. */}
        <p role="status" className="sr-only">
          {state.total === 1 ? '1 brechó encontrado' : `${state.total} brechós encontrados`}
        </p>

        <ul
          aria-label="Brechós encontrados"
          className="grid gap-4 tablet:grid-cols-2 web:grid-cols-3"
        >
          {state.stores.map((store) => (
            <li key={store.id}>
              <StoreCard
                store={store}
                preview={previews[store.id]}
                onOpen={(id) => navigate(storeProfile(id))}
              />
            </li>
          ))}
        </ul>

        {loadMoreError ? (
          <p role="alert" className="text-body-sm text-vermelho-escuro">
            Não foi possível carregar mais brechós. Tente de novo.
          </p>
        ) : null}

        {hasMore ? (
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loadingMore}
            className="self-center"
          >
            {loadingMore ? 'Carregando...' : 'Carregar mais'}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <Container as="main" className="flex flex-col gap-6 py-6 tablet:py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h2 text-tinta">Brechós do RS</h1>
        <p className="font-ui text-body text-texto-auxiliar">
          Encontre um brechó pelo nome e veja as peças que ele tem para vender.
        </p>
      </div>

      <form role="search" aria-label="Buscar brechós por nome" onSubmit={handleSubmit}>
        <label htmlFor="busca-brecho" className="sr-only">
          Buscar por nome do brechó
        </label>
        <div className="flex items-center gap-2 border border-linha bg-branco-quente px-3 focus-within:border-tinta focus-within:ring-1 focus-within:ring-tinta">
          <SearchIcon />
          <input
            id="busca-brecho"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar por nome do brechó…"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent py-2.5 font-ui text-body text-tinta outline-none placeholder:text-texto-auxiliar [&::-webkit-search-cancel-button]:appearance-none"
          />
        </div>
      </form>

      {content()}
    </Container>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-texto-auxiliar"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/** Esqueleto da lista: a altura do cartão evita o conteúdo "pular" quando os dados chegam. */
function StoresSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Carregando brechós...</span>
      <ul aria-hidden="true" className="grid gap-4 tablet:grid-cols-2 web:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <li
            key={key}
            className="h-56 animate-pulse border border-linha bg-papel-profundo motion-reduce:animate-none"
          />
        ))}
      </ul>
    </div>
  );
}

export default Stores;
