import { httpClient } from '@/services/httpClient';
import { getPreferences } from '@/services/preferenceService';
import { mapFeedItem, toReais, type ApiFeedItem } from '@/services/catalogService';
import { products as mockProducts } from '@/mocks/products';
import type { Paginated, Product, ProductDetail, ProductStatus } from '@/types/product';

/**
 * Service de recomendações pelo perfil de estilo (FE-SVC-recommendations,
 * issue #313). Devolve peças por similaridade de estilo (RN-64, RN-35) —
 * não é filtragem colaborativa (RN-62).
 *
 * `items: Product[]` (não `ProductDetail[]`): "mesma forma da vitrine", a
 * própria issue manda reaproveitar `mapFeedItem` do `catalogService`, que
 * devolve `Product`. Usar `ProductDetail` exigiria uma chamada extra por
 * peça no modo API (buscar o detalhe de cada recomendação), sem nenhum
 * consumidor que precisa desses campos a mais -> decisão registrada em
 * comentário na #313.
 *
 * Dinheiro: o `price` pode chegar como número ou string (`Decimal` do
 * Pydantic), então passa por `toReais` antes do mapeador, mesmo padrão da
 * busca por imagem (#315): `mapFeedItem({ ...item, price: toReais(item.price) })`.
 *
 * FLAG `VITE_USE_MOCKS` (mesmo padrão dos outros services da S2/S3).
 *
 * API real — contrato fechado pelo back em 05/10 (back-end#253, ajustado no
 * front pela #355):
 *
 *   `GET /users/me/recommendations?page=` (o `baseURL` do `httpClient` já
 *   termina em `/api`) → `{ items, personalized, page, page_size, total }`.
 *   Item no formato do feed: `id`, `name`, `price`, `cover_image_url`,
 *   `status` e `store { id, name, verified }`. 401 sem sessão.
 *
 *   - Sem preferências NUNCA é erro (RN-38): 200 com `personalized: false` e
 *     a lista genérica do feed.
 *   - A lista nunca volta vazia enquanto houver catálogo (RN-61).
 *
 * O mock segue o mesmo contrato: sem preferência de estilo, devolve o feed
 * genérico com o critério do mock do `catalogService` (só `ativo`, mais
 * recente primeiro), paginado.
 *
 * Usage:
 *   import { getRecommendations } from '@/services/recommendationService';
 *
 *   const { items, personalized } = await getRecommendations();
 */

export interface Recommendations {
  items: Product[];
  /** `false` = o back não tinha preferências e devolveu genérico (RN-38). */
  personalized: boolean;
  page: number;
  pageSize: number;
  total: number;
}

const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';
const DEFAULT_PAGE_SIZE = 20;

function paginate<T>(items: T[], page: number, pageSize: number): Paginated<T> {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, total: items.length };
}

/**
 * Mesma projeção `ProductDetail → Product` do `catalogService` (lá é
 * privada): reimplementada aqui porque é um `pick` trivial de 5 campos —
 * não justifica criar uma dependência cruzada de função privada entre os
 * dois services só por isso.
 */
function toRecommendationItem({ id, name, price, coverImageUrl, store }: ProductDetail): Product {
  return { id, name, price, coverImageUrl, store };
}

// ---------------------------------------------------------------------------
// Modo MOCK
// ---------------------------------------------------------------------------

async function mockGetRecommendations(page: number): Promise<Recommendations> {
  const preferences = await getPreferences();
  const styleValues = preferences
    .filter((preference) => preference.type === 'estilo')
    .map((preference) => preference.value);

  if (styleValues.length === 0) {
    // RN-38/RN-61: feed genérico, mesmo critério do mock do `catalogService`
    // (só `ativo`, mais recente primeiro).
    const feed = mockProducts.filter((product) => product.status === 'ativo').reverse();
    const { items, total } = paginate(feed.map(toRecommendationItem), page, DEFAULT_PAGE_SIZE);
    return { items, personalized: false, page, pageSize: DEFAULT_PAGE_SIZE, total };
  }

  const matches = mockProducts.filter(
    (product) =>
      product.status === 'ativo' &&
      product.style !== undefined &&
      styleValues.includes(product.style),
  );

  const { items, total } = paginate(matches.map(toRecommendationItem), page, DEFAULT_PAGE_SIZE);

  return { items, personalized: true, page, pageSize: DEFAULT_PAGE_SIZE, total };
}

// ---------------------------------------------------------------------------
// Modo API real — contrato do back-end#253.
// ---------------------------------------------------------------------------

/**
 * Item do feed. `price` aceita string (`Decimal`); `status` vem no contrato,
 * mas o `Product` do feed não o carrega e `mapFeedItem` o descarta.
 */
type ApiRecommendationItem = Omit<ApiFeedItem, 'price'> & {
  price: number | string;
  status: ProductStatus;
};

interface ApiRecommendationsResponse {
  items: ApiRecommendationItem[];
  page: number;
  page_size: number;
  total: number;
  personalized: boolean;
}

async function apiGetRecommendations(page: number): Promise<Recommendations> {
  const { data } = await httpClient.get<ApiRecommendationsResponse>('/users/me/recommendations', {
    params: { page },
  });

  return {
    items: data.items.map((item) => mapFeedItem({ ...item, price: toReais(item.price) })),
    personalized: data.personalized,
    page: data.page,
    pageSize: data.page_size,
    total: data.total,
  };
}

// ---------------------------------------------------------------------------
// Seleção do modo.
// ---------------------------------------------------------------------------

export function getRecommendations(page = 1): Promise<Recommendations> {
  return useMocks ? mockGetRecommendations(page) : apiGetRecommendations(page);
}
