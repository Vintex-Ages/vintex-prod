import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Container from '@/components/layout/Container';
import { ProductGrid } from '@/components/product/ProductGrid';
import { VintexSearchSpotlight } from '@/components/vintex-ai/VintexSearchSpotlight';
import { paths, productDetail } from '@/routes/paths';
import { getFeed } from '@/services/catalogService';
import { formatPieceCount } from '@/utils/format';
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
 */
function Home() {
  const navigate = useNavigate();
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

  return (
    <main>
      <Container className="pt-6 tablet:pt-8">
        {/*
          A partir de #207: o spotlight é o caminho em destaque a partir do
          `tablet` (RN-94) — no mobile o FAB (Layout) já cobre esse papel, e
          um bloco vermelho ocupando a dobra inteira não cabe bem numa tela
          estreita. Sem ele, a página perderia o `h1`, por isso o heading
          equivalente fica visível só no mobile.
        */}
        <h1 className="font-display text-h2 text-tinta tablet:hidden">
          Garimpe a peça certa nos brechós do Rio Grande do Sul.
        </h1>

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

      <Container
        as="section"
        aria-labelledby="feed-titulo"
        aria-busy={loading || loadingMore}
        className="pt-10 tablet:pt-14"
      >
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="feed-titulo" className="font-display text-h2 text-tinta">
            Feed de achados
          </h2>
          {feed && feed.total > 0 && (
            <p className="font-ui text-body text-texto-auxiliar">
              {formatPieceCount(feed.total)} à venda agora
            </p>
          )}
        </div>

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