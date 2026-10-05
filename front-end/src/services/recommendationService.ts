import { httpClient } from '@/services/httpClient';
import { getPreferences } from '@/services/preferenceService';
import { mapFeedItem } from '@/services/catalogService';
import { products as mockProducts } from '@/mocks/products';
import type { Paginated, Product, ProductDetail } from '@/types/product';

/**
 * Service de recomendações pelo perfil de estilo (FE-SVC-recommendations,
 * issue #313). Devolve peças por similaridade de estilo (RN-64, RN-35) —
 * não é filtragem colaborativa (RN-62).
 *
 * `items: Product[]` (não `ProductDetail[]`): "mesma forma da vitrine", a
 * própria issue manda reaproveitar `mapFeedItem` do `catalogService`, que
 * devolve `Product`. Usar `ProductDetail` exigiria uma chamada extra por
 * peça no modo API (buscar o detalhe de cada recomendação), sem nenhum
 * consumidor que precise desses campos a mais — decisão registrada na
 * conversa da issue.
 *
 * Dinheiro: `mapFeedItem` já trata o `price` como `number` puro, sem
 * conversão — confirmado contra o back que `ProductFeedItemResponse` tem
 * `@field_serializer("price")` forçando `float` (nunca string) nesse
 * endpoint específico. A ambiguidade "Decimal como string ou número" que
 * os outros services da S3 tratam não existe aqui, porque este service
 * reaproveita o mesmo mapeador do feed normal, não implementa um novo.
 *
 * FLAG `VITE_USE_MOCKS` (mesmo padrão dos outros services da S2/S3).
 *
 * API real (quando existir)
 *
 *   Proposta do front — o back ainda não tem nada disso na `develop`
 *   (verificado em 30/09). Confirmar nome, verbo e shape com o par de
 *   back-end antes de ligar o flag.
 *
 *   `GET /users/me/recommendations?page=` → `Page[FeedItem] & { personalized: bool }`
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
    return { items: [], personalized: false, page, pageSize: DEFAULT_PAGE_SIZE, total: 0 };
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
// Modo API real — proposta do front, não confirmada (ver doc do arquivo).
// ---------------------------------------------------------------------------

/** Mesmo shape de item que `catalogService` usa para `mapFeedItem` — reaproveitado via tipo, sem duplicar a interface. */
type ApiFeedItem = Parameters<typeof mapFeedItem>[0];

interface ApiRecommendationsResponse {
  items: ApiFeedItem[];
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
    items: data.items.map(mapFeedItem),
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
