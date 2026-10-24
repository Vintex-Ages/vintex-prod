import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CATEGORIES, CONDITIONS, COLORS, SIZES } from '@/components/catalog/categories';
import BrandSignature from '@/components/common/BrandSignature';
import FilterPanel from '@/components/catalog/FilterPanel';
import { SearchBar } from '@/components/catalog/SearchBar';
import { SuggestionBlock } from '@/components/catalog/SuggestionBlock';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import IconButton from '@/components/common/IconButton';
import Container from '@/components/layout/Container';
import { ProductGrid } from '@/components/product/ProductGrid';
import { paths, productDetail } from '@/routes/paths';
import { search, searchByImage } from '@/services/catalogService';
import type { ImageInterpretation } from '@/services/catalogService';
import type { CatalogFilters } from '@/types/catalog';
import type { FilterParams, Product, SearchResult } from '@/types/product';
import { fromCatalogSearch } from '@/utils/catalogQuery';

const STALE_IMAGE_NOTICE =
  'Não foi possível recuperar a foto. Escolha a imagem de novo ou busque por texto.';
const INVALID_IMAGE_NOTICE = 'Não foi possível usar essa foto. Escolha outra imagem.';

/**
 * Converte os filtros do painel (múltipla escolha) para o formato aceito
 * pelo catalogService (um valor só por campo). Limitação conhecida: quando
 * o usuário marca mais de um valor no mesmo campo (ex.: tamanho M e G), só
 * o primeiro é enviado à API. Ajustar quando `FilterParams` suportar
 * arrays — débito técnico.
 */
function toFilterParams(filters: CatalogFilters): FilterParams {
  return {
    category: filters.category,
    priceMin: filters.minPrice,
    priceMax: filters.maxPrice,
    size: filters.size?.[0],
    brand: filters.brand?.[0],
    condition: filters.condition?.[0],
    color: filters.color?.[0],
    city: filters.city,
    state: filters.state,
  };
}

/** Texto do estado vazio: na busca por foto o convite é outro (RN-61). */
function getEmptyCopy(searching: boolean, byImage: boolean) {
  if (byImage) {
    return {
      title: 'Nada parecido com essa foto',
      message: 'Tire um filtro ou busque por texto para ampliar o resultado.',
    };
  }
  if (searching) {
    return {
      title: 'Nada com essa combinação',
      message: 'Tente outro termo ou tire um filtro para ampliar a busca.',
    };
  }
  return {
    title: 'Ainda não há peças por aqui',
    message: 'Os brechós estão cadastrando o acervo. Volte em instantes.',
  };
}

/**
 * Catálogo — busca, filtros e grade de peças.
 *
 * Decisões da revisão visual:
 *
 * - **A página passa a ter faixa de conteúdo.** Era a única do produto sem
 *   largura máxima: em 1440px o conteúdo sangrava de ponta a ponta enquanto o
 *   cabeçalho ficava centrado, e o título da página nascia 200px à esquerda da
 *   marca.
 * - **O termo buscado vive na URL** (`/catalog?q=`). Antes ficava só em estado
 *   local: a busca do cabeçalho não tinha como chegar aqui, o resultado não
 *   tinha endereço para compartilhar e o "voltar" do navegador não desfazia a
 *   busca.
 * - **O painel de filtros deixa de abrir vazio.** `FilterPanel` já aceitava as
 *   opções de tamanho, conservação e cor, mas nenhuma tela passava nada — os
 *   grupos apareciam como legendas soltas sem nada embaixo.
 * - **Vazio e erro têm saída** — limpar os filtros e tentar de novo.
 * - **Filtros também chegam pela URL** (`?category=…&color=…&priceMax=…`, ver
 *   `utils/catalogQuery.ts`): é assim que "Ver no catálogo" da interpretação
 *   da Vintex (FE-US027-3) abre a busca já filtrada.
 * - **Busca por foto (FE-US031-1, RN-60).** A foto escolhida na barra (ou vinda
 *   de outra tela em `location.state.image`) liga o modo imagem: o catálogo
 *   passa a chamar `searchByImage` e os filtros do painel se aplicam por cima.
 *   A foto vive só em memória; `?modo=imagem` marca o modo na URL, e quem
 *   recarrega sem a foto volta ao catálogo normal com um aviso. Digitar ou
 *   enviar texto sai do modo imagem, porque a rota de imagem não aceita `q`.
 */
function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const query = searchParams.get('q') ?? '';
  const categoryParam = searchParams.get('category') || undefined;
  const legacyCategory = categoryParam
    ? undefined
    : CATEGORIES.find((option) => option.value && option.value === query)?.value;
  const term = legacyCategory ? '' : query;
  const category = categoryParam ?? legacyCategory;
  const imageMode = searchParams.get('modo') === 'imagem';
  const navigationImage = (location.state as { image?: unknown } | null)?.image;

  const [inputValue, setInputValue] = useState(term);
  const [filters, setFilters] = useState<CatalogFilters>(() => ({
    ...fromCatalogSearch(searchParams),
    ...(category ? { category } : {}),
  }));
  // Chegar de novo por um link com outros filtros (ex.: outra resposta da
  // Vintex) substitui o painel. A categoria escolhida no painel também vai
  // para a URL; `handleFiltersChange` atualiza a chave antes de escrever, para
  // esta troca não apagar os outros filtros do painel.
  const urlFiltersKey = JSON.stringify(fromCatalogSearch(searchParams));
  const lastUrlFiltersKey = useRef(urlFiltersKey);
  useEffect(() => {
    if (urlFiltersKey === lastUrlFiltersKey.current) return;
    lastUrlFiltersKey.current = urlFiltersKey;
    setFilters(JSON.parse(urlFiltersKey) as CatalogFilters);
  }, [urlFiltersKey]);
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  /** Motivo das sugestões quando a busca não acha nada (RN-61). */
  const [suggestionReason, setSuggestionReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestSequence = useRef(0);

  // Busca por foto: a foto fica só em memória (estado da tela ou da navegação).
  const [image, setImage] = useState<File | null>(() =>
    navigationImage instanceof File ? navigationImage : null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [interpreted, setInterpreted] = useState<ImageInterpretation | null>(null);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(() =>
    imageMode && !(navigationImage instanceof File) ? STALE_IMAGE_NOTICE : null,
  );
  // `setSearchParams` muda de identidade a cada troca de URL; guardá-la numa ref
  // impede que `run` seja recriado (e a busca refeita) só porque a URL mudou.
  const setSearchParamsRef = useRef(setSearchParams);
  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  });
  // Recarregou com `?modo=imagem` mas sem a foto: tira a marca da URL, uma vez.
  // Só na montagem de propósito: ao sair do modo, o estado e a URL mudam em
  // momentos diferentes, e olhar os dois aqui geraria um aviso falso.
  const checkedStaleMode = useRef(false);
  useEffect(() => {
    if (checkedStaleMode.current) return;
    checkedStaleMode.current = true;
    if (!imageMode || image) return;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('modo');
        return next;
      },
      { replace: true },
    );
  }, [imageMode, image, setSearchParams]);

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  // A busca também parte do cabeçalho, que escreve `?q=` e navega para cá. Sem
  // isto o campo da página continuaria mostrando o termo anterior.
  useEffect(() => {
    setInputValue(term);
  }, [term]);

  useEffect(() => {
    if (!legacyCategory) return;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('q');
        next.set('category', legacyCategory);
        return next;
      },
      { replace: true },
    );
  }, [legacyCategory, setSearchParams]);

  useEffect(() => {
    setFilters((current) => (current.category === category ? current : { ...current, category }));
  }, [category]);

  const run = useCallback(() => {
    const requestId = ++requestSequence.current;
    const requestTerm = term;
    const requestFilters = toFilterParams(filters);
    const requestImage = image;

    setLoading(true);
    setError(false);
    setImageUnavailable(false);
    setSuggestionReason(null);

    if (requestImage) {
      searchByImage(requestImage, requestFilters)
        .then((result) => {
          if (requestId !== requestSequence.current) return;
          setItems(result.items);
          setTotal(result.total);
          setInterpreted(result.interpreted);
          setError(false);
        })
        .catch((caught: unknown) => {
          if (requestId !== requestSequence.current) return;
          const code = (caught as { code?: string } | null)?.code;

          // Foto recusada antes do envio (tipo ou tamanho): sai do modo imagem.
          if (code === 'UNSUPPORTED_IMAGE_TYPE' || code === 'IMAGE_TOO_LARGE') {
            setNotice(caught instanceof Error ? caught.message : INVALID_IMAGE_NOTICE);
            setImage(null);
            setInterpreted(null);
            setSearchParamsRef.current(
              (current) => {
                const next = new URLSearchParams(current);
                next.delete('modo');
                return next;
              },
              { replace: true },
            );
            return;
          }

          setImageUnavailable(code === 'AI_UNAVAILABLE');
          setError(true);
        })
        .finally(() => {
          if (requestId === requestSequence.current) setLoading(false);
        });

      return () => {
        requestSequence.current += 1;
      };
    }

    setInterpreted(null);
    search(requestTerm, requestFilters)
      .then((result: SearchResult) => {
        if (requestId !== requestSequence.current) return;
        // `fallback` traz a lista em `suggestions.items` e deixa `items` vazio.
        // Renderizar as sugestões no mesmo grid garante a RN-61: nunca uma tela
        // vazia enquanto houver catálogo.
        const fallback = result.match_type === 'fallback' ? result.suggestions : undefined;
        setItems(fallback ? (fallback.items ?? []) : result.items);
        setTotal(result.total);
        setSuggestionReason(fallback ? fallback.reason : null);
        setError(false);
      })
      .catch(() => {
        if (requestId === requestSequence.current) setError(true);
      })
      .finally(() => {
        if (requestId === requestSequence.current) setLoading(false);
      });

    return () => {
      requestSequence.current += 1;
    };
  }, [term, filters, image]);

  useEffect(run, [run]);

  function resetImageState() {
    setImage(null);
    setInterpreted(null);
    setImageUnavailable(false);
  }

  function handleImageSelect(file: File) {
    setNotice(null);
    setImage(file);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('modo', 'imagem');
        return next;
      },
      { replace: true },
    );
  }

  function leaveImageMode() {
    resetImageState();
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('modo');
        return next;
      },
      { replace: true },
    );
  }

  function handleSubmit(value: string) {
    const trimmed = value.trim();
    // Troca só o `q`: filtros que vieram pela URL continuam valendo.
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (trimmed) next.set('q', trimmed);
        else next.delete('q');
        next.delete('modo');
        return next;
      },
      { replace: true },
    );
    resetImageState();
  }

  function handleSearchChange(value: string) {
    setInputValue(value);
    const query = value.trim();
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (query) next.set('q', query);
        else next.delete('q');
        next.delete('modo');
        return next;
      },
      { replace: true },
    );
    resetImageState();
  }

  function handleFiltersChange(nextFilters: CatalogFilters) {
    setFilters(nextFilters);
    const next = new URLSearchParams(searchParams);
    if (nextFilters.category) next.set('category', nextFilters.category);
    else next.delete('category');
    lastUrlFiltersKey.current = JSON.stringify(fromCatalogSearch(next));
    setSearchParams(next, { replace: true });
  }

  const hasFilters = Object.values(filters).some(
    (value) => value !== undefined && (!Array.isArray(value) || value.length > 0),
  );

  function clearEverything() {
    resetImageState();
    setFilters({});
    setSearchParams({}, { replace: true });
  }

  /** Na busca por foto, limpar os filtros mantém a foto. */
  function clearFilters() {
    setFilters({});
    const next = new URLSearchParams();
    next.set('modo', 'imagem');
    lastUrlFiltersKey.current = JSON.stringify(fromCatalogSearch(next));
    setSearchParams(next, { replace: true });
  }

  function renderEmptyAction() {
    if (image) {
      return (
        <div className="flex flex-wrap justify-center gap-3">
          {hasFilters && (
            <Button variant="secondary" onClick={clearFilters}>
              Limpar filtros
            </Button>
          )}
          <Button variant="quiet" onClick={leaveImageMode}>
            Buscar por texto
          </Button>
        </div>
      );
    }
    if (term || hasFilters) {
      return (
        <Button variant="secondary" onClick={clearEverything}>
          Limpar busca e filtros
        </Button>
      );
    }
    return undefined;
  }

  const emptyCopy = getEmptyCopy(Boolean(term) || hasFilters, image !== null);
  const interpretedLabels = [interpreted?.category, interpreted?.color, interpreted?.brand].filter(
    (label): label is string => Boolean(label),
  );

  return (
    <Container as="main" className="flex flex-col gap-4 pt-6 pb-0 tablet:gap-6 tablet:py-8">
      <div className="-mx-4 -mt-6 tablet:hidden">
        <BrandSignature headingAs="p" />
      </div>

      <div className="flex flex-col gap-4">
        <h1 className="sr-only">Catálogo</h1>

        <SearchBar
          value={inputValue}
          onChange={handleSearchChange}
          onSubmit={handleSubmit}
          onImageSelect={handleImageSelect}
          loading={loading}
        />

        {notice && (
          <p
            role="alert"
            className="border-l-2 border-dourado bg-papel-profundo px-3 py-2 font-ui text-body-sm text-tinta"
          >
            {notice}
          </p>
        )}

        {image && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 border border-linha bg-branco-quente p-2">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Foto da busca"
                  className="h-12 w-12 shrink-0 object-cover"
                />
              )}
              <p className="min-w-0 flex-1 truncate font-ui text-body-sm text-tinta">
                Buscando por foto
              </p>
              <IconButton
                icon={
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  </svg>
                }
                ariaLabel="Sair da busca por foto"
                onClick={leaveImageMode}
              />
            </div>

            {interpretedLabels.length > 0 && (
              <section
                aria-label="O que a Vintex viu na foto"
                className="flex flex-col gap-2 border border-linha bg-branco-quente p-3"
              >
                <p className="font-ui text-label text-texto-auxiliar">A Vintex viu na foto:</p>
                <ul className="flex flex-wrap gap-2">
                  {interpretedLabels.map((label) => (
                    <li
                      key={label}
                      className="rounded-full border border-linha px-3 py-1 font-ui text-label text-tinta"
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      <div className="hidden tablet:block">
        <Link
          to={paths.vintex}
          className="flex min-h-touch items-center justify-between gap-4 bg-vermelho-escuro px-5 py-3 font-ui text-branco-quente transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-branco-quente"
        >
          <span className="font-display text-h4 web:text-h3">Prefere descrever o que procura?</span>
          <span className="inline-flex shrink-0 items-center gap-2 text-body-sm font-semibold underline underline-offset-4">
            Conversar com a Vintex
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path
                d="M5 12h14m-6-6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </Link>
      </div>

      <FilterPanel
        filters={filters}
        onChange={handleFiltersChange}
        sizeOptions={[...SIZES]}
        conditionOptions={[...CONDITIONS]}
        colorOptions={[...COLORS]}
        resultCount={loading ? undefined : total}
      />

      {error ? (
        <>
          <ErrorState
            message={
              imageUnavailable
                ? 'A análise da foto está indisponível agora. Tente de novo ou busque por texto.'
                : 'Não foi possível carregar as peças agora.'
            }
            onRetry={run}
          />
          {imageUnavailable && (
            <div>
              <Button variant="quiet" onClick={leaveImageMode}>
                Buscar por texto
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {suggestionReason && <SuggestionBlock reason={suggestionReason} />}

          {/*
            Grade do design system, em vez de <li> manual: traz foto, loja, preço em
            pt-BR, skeleton de carregamento, estado vazio e link real para a peça.
          */}
          <ProductGrid
            products={items}
            loading={loading}
            productPath={productDetail}
            // Com `productPath` real, quem navega é o `<Link>` do cartão. Navegar
            // aqui também empilharia duas entradas no histórico e o "voltar" não
            // sairia da peça; `onOpen` fica como ponto de telemetria.
            onOpen={() => {}}
            emptyState={
              <EmptyState
                title={emptyCopy.title}
                message={emptyCopy.message}
                action={renderEmptyAction()}
              />
            }
          />
        </>
      )}
    </Container>
  );
}

export default Catalog;
