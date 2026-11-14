import { httpClient } from '@/services/httpClient';
import { CatalogError, toReais } from '@/services/catalogService';
import { products as mockProducts } from '@/mocks/products';
import type { ProductDetail } from '@/types/product';
import type { LookMatchType, LookPiece, LookSuggestion } from '@/types/look';

/**
 * Service de combinações: peças que combinam com uma peça (FE-SVC-combinations,
 * issue #428). Dada uma peça, devolve as peças de categoria diferente, o tipo do
 * resultado (`exact` ou `fallback`) e o valor total do conjunto (RN-63).
 *
 * FLAG `VITE_USE_MOCKS` (mesmo padrão dos outros services):
 *   - ausente ou `'true'` → mock sobre o catálogo de demonstração;
 *   - `'false'` → API real via `httpClient`.
 *
 * API real — contrato fixado na back-end#328 (rota ainda não implementada no
 * back; se o formato mudar, a correção fica aqui e a tela não muda):
 *
 *   `GET /products/{product_id}/combinations` (o `baseURL` do `httpClient` já
 *   termina em `/api`), pública, sem login
 *   → 200 `{ pieces: [{ id, name, price, category, cover_image_url,
 *                       store: { id, name } }],
 *            match_type: 'exact' | 'fallback', total_amount }`
 *   → 404 só quando a peça de origem não existe.
 *
 * - A peça de origem pode estar `reservado` ou `vendido`: responde 200, porque
 *   a combinação também dispara depois da compra (RN-63).
 * - As peças devolvidas são sempre `ativo` e de categoria diferente da origem.
 * - Sem vetor na origem, volta `fallback` com peças ativas de outras categorias,
 *   nunca lista vazia (RN-61).
 * - Dinheiro: `price` e `total_amount` podem chegar como número ou string
 *   (`Decimal`) e passam por `toReais`, como no catálogo.
 *
 * O mock segue o mesmo contrato. O catálogo de demonstração tem só a categoria
 * "Roupas", então o mock deduz do nome da peça um tipo (parte de cima, parte de
 * baixo, vestido, casaco) e combina peças de tipos diferentes.
 *
 * Usage:
 *   import { getCombinations } from '@/services/combinationService';
 *
 *   const { pieces, matchType, totalAmount } = await getCombinations('12');
 */

const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

/** Quantas peças compõem o conjunto no mock: uma por categoria, no máximo. */
const MOCK_MAX_PIECES = 3;

/**
 * Erro de combinação com `code` tipado, igual em mock e API real.
 * Códigos: `PRODUCT_NOT_FOUND`, `INTERNAL_ERROR`.
 */
export class CombinationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CombinationError';
  }
}

function productNotFound(productId: string): CombinationError {
  return new CombinationError('PRODUCT_NOT_FOUND', `Peça ${productId} não encontrada.`);
}

/** Soma em reais sem a sujeira de ponto flutuante (0,1 + 0,2). */
function sumPrices(pieces: LookPiece[]): number {
  return Math.round(pieces.reduce((total, piece) => total + piece.price * 100, 0)) / 100;
}

// ---------------------------------------------------------------------------
// Modo MOCK
// ---------------------------------------------------------------------------

/** Tipos do mock, na ordem de verificação: o primeiro que casar com o nome vence. */
const MOCK_CATEGORIES: { category: string; pattern: RegExp }[] = [
  { category: 'Casacos', pattern: /jaqueta|blazer|casaco|cardigã|colete|kimono|moletom/i },
  { category: 'Vestidos', pattern: /vestido|macacão/i },
  { category: 'Parte de baixo', pattern: /calça|saia|short|bermuda/i },
];
const MOCK_DEFAULT_CATEGORY = 'Parte de cima';

function mockCategory(product: ProductDetail): string {
  return (
    MOCK_CATEGORIES.find(({ pattern }) => pattern.test(product.name))?.category ??
    MOCK_DEFAULT_CATEGORY
  );
}

function toLookPiece(product: ProductDetail): LookPiece {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    category: mockCategory(product),
    coverImageUrl: product.coverImageUrl,
    store: { id: product.store.id, name: product.store.name },
  };
}

/**
 * Uma peça por categoria, até `MOCK_MAX_PIECES`, preferindo lojas ainda não
 * usadas: o conjunto pode atravessar lojas (RN-63).
 */
function pickPieces(candidates: ProductDetail[]): LookPiece[] {
  const byCategory = new Map<string, ProductDetail[]>();
  for (const candidate of candidates) {
    const category = mockCategory(candidate);
    byCategory.set(category, [...(byCategory.get(category) ?? []), candidate]);
  }

  const picked: ProductDetail[] = [];
  for (const group of byCategory.values()) {
    if (picked.length === MOCK_MAX_PIECES) break;
    const usedStores = new Set(picked.map((product) => product.store.id));
    picked.push(group.find((product) => !usedStores.has(product.store.id)) ?? group[0]);
  }
  return picked.map(toLookPiece);
}

function mockGetCombinations(productId: string): LookSuggestion {
  const source = mockProducts.find((product) => product.id === productId);
  // 404 só quando a peça não existe: `reservado` e `vendido` respondem 200.
  if (!source) throw productNotFound(productId);

  const sourceCategory = mockCategory(source);
  // Só peça `ativo`, de categoria diferente, e nunca a própria peça de origem.
  const others = mockProducts.filter(
    (product) =>
      product.status === 'ativo' &&
      product.id !== source.id &&
      mockCategory(product) !== sourceCategory,
  );

  // Por semelhança de estilo (RN-62); sem estilo na origem ou sem par, cai para `fallback` (RN-61).
  const similar = source.style ? others.filter((product) => product.style === source.style) : [];
  const exact = similar.length > 0;
  const pieces = pickPieces(exact ? similar : others);

  return {
    pieces,
    matchType: exact ? 'exact' : 'fallback',
    totalAmount: sumPrices(pieces),
  };
}

// ---------------------------------------------------------------------------
// Modo API real — contrato da back-end#328.
// ---------------------------------------------------------------------------

interface ApiCombinationPiece {
  id: number | string;
  name: string;
  price: number | string;
  category: string;
  cover_image_url: string | null;
  store: { id: number | string; name: string };
}

interface ApiCombinationsResponse {
  pieces: ApiCombinationPiece[];
  match_type: LookMatchType;
  total_amount: number | string;
}

function mapApiPiece(piece: ApiCombinationPiece): LookPiece {
  return {
    id: String(piece.id),
    name: piece.name,
    price: toReais(piece.price),
    category: piece.category,
    coverImageUrl: piece.cover_image_url,
    store: { id: String(piece.store.id), name: piece.store.name },
  };
}

function toCombinationError(error: unknown, productId: string): CombinationError {
  if (error instanceof CatalogError) {
    // Preço ilegível na resposta: `toReais` já avisa, mas o erro sai no formato deste service.
    return new CombinationError('INTERNAL_ERROR', error.message);
  }
  const status = (error as { response?: { status?: number } }).response?.status;
  if (status === 404) return productNotFound(productId);
  return new CombinationError('INTERNAL_ERROR', 'Erro ao buscar as peças que combinam.');
}

async function apiGetCombinations(productId: string): Promise<LookSuggestion> {
  try {
    const { data } = await httpClient.get<ApiCombinationsResponse>(
      `/products/${productId}/combinations`,
    );
    return {
      pieces: data.pieces.map(mapApiPiece),
      matchType: data.match_type,
      totalAmount: toReais(data.total_amount),
    };
  } catch (error) {
    throw toCombinationError(error, productId);
  }
}

// ---------------------------------------------------------------------------
// Seleção do modo.
// ---------------------------------------------------------------------------

/**
 * Peças que combinam com a peça `productId` (RN-63): categoria diferente, só
 * `ativo`, com o valor total do conjunto. `404` vira `CombinationError`
 * (`PRODUCT_NOT_FOUND`); uma peça de origem vendida responde normalmente.
 */
export function getCombinations(productId: string): Promise<LookSuggestion> {
  return useMocks
    ? Promise.resolve().then(() => mockGetCombinations(productId))
    : apiGetCombinations(productId);
}
