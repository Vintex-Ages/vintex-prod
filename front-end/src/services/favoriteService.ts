import axios from 'axios';
import { products as mockProducts } from '@/mocks/products';
import type { ApiError } from '@/types/auth';
import type { FavoriteProduct } from '@/types/favorite';
import type { Paginated, ProductStatus } from '@/types/product';
import { mapFeedItem, type ApiFeedItem } from './catalogService';
import { httpClient } from './httpClient';

/**
 * Service de favoritos (FE-SVC-favorites, issue #316).
 *
 * FLAG `VITE_USE_MOCKS` (mesmo padrão de `cartService`):
 *   - ausente ou `'true'` → mock via `sessionStorage`, isolado por usuário;
 *   - `'false'` → API real via `httpClient`.
 *
 * API real — contrato fechado pelo back em 05/10 (back-end#252); a rota ainda
 * não está na `develop` do back:
 *   `GET    /users/me/favorites?page=`         → Page de item do feed com `status`
 *   `PUT    /users/me/favorites/{product_id}`  → 204, idempotente
 *   `DELETE /users/me/favorites/{product_id}`  → 204, idempotente
 * Erros: 401 sem sessão (mesmo corpo das ações protegidas), 404 peça
 * inexistente no `PUT`. Rejeita com `ApiError`, como o `cartService`.
 *
 * `userId` vem do `AuthContext` (`useAuth().user.id`), pelo mesmo motivo do
 * `cartService`: o mock de auth perde a sessão num F5. O modo API ignora o
 * `userId`, porque o back identifica o usuário pelo token.
 *
 * Usage:
 *   import { addFavorite, listFavorites } from '@/services/favoriteService';
 *
 *   await addFavorite(user.id, productId);
 *   const { items } = await listFavorites(user.id);
 */

const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

/** Mesmo default do back (`app/core/pagination.py`). */
const DEFAULT_PAGE_SIZE = 20;

/** Teto de páginas em `listFavoriteIds`, para uma resposta errada não virar laço sem fim. */
const MAX_PAGES = 50;

// ---------------------------------------------------------------------------
// Modo MOCK — ids em sessionStorage, isolados por usuário.
// ---------------------------------------------------------------------------

interface StoredFavorite {
  productId: string;
  addedAt: string;
}

function favoritesStorageKey(userId: string): string {
  return `favorites:${userId}`;
}

/** Mais recente primeiro. Só o id fica guardado: nome, preço e status vêm do catálogo. */
function readStored(userId: string): StoredFavorite[] {
  const raw = window.sessionStorage.getItem(favoritesStorageKey(userId));
  return raw ? (JSON.parse(raw) as StoredFavorite[]) : [];
}

function writeStored(userId: string, favorites: StoredFavorite[]): void {
  window.sessionStorage.setItem(favoritesStorageKey(userId), JSON.stringify(favorites));
}

function toFavoriteProduct(productId: string): FavoriteProduct | null {
  const product = mockProducts.find((item) => item.id === productId);
  if (!product) return null;
  const { id, name, price, coverImageUrl, store, status } = product;
  return { id, name, price, coverImageUrl, store, status };
}

async function mockListFavorites(
  userId: string,
  page: number,
): Promise<Paginated<FavoriteProduct>> {
  const items = readStored(userId)
    .map((favorite) => toFavoriteProduct(favorite.productId))
    .filter((product): product is FavoriteProduct => product !== null);
  const start = (page - 1) * DEFAULT_PAGE_SIZE;
  return {
    items: items.slice(start, start + DEFAULT_PAGE_SIZE),
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    total: items.length,
  };
}

async function mockAddFavorite(userId: string, productId: string): Promise<void> {
  if (!toFavoriteProduct(productId)) {
    throw { code: 'PRODUCT_NOT_FOUND', message: 'Peça não encontrada.' } satisfies ApiError;
  }
  const stored = readStored(userId);
  if (stored.some((favorite) => favorite.productId === productId)) return;
  writeStored(userId, [{ productId, addedAt: new Date().toISOString() }, ...stored]);
}

async function mockRemoveFavorite(userId: string, productId: string): Promise<void> {
  writeStored(
    userId,
    readStored(userId).filter((favorite) => favorite.productId !== productId),
  );
}

// ---------------------------------------------------------------------------
// Modo API real — contrato do back-end#252.
// ---------------------------------------------------------------------------

/** Item do feed com `status`. `price` aceita string (`Decimal` serializado). */
type ApiFavoriteItem = Omit<ApiFeedItem, 'price'> & {
  price: number | string;
  status: ProductStatus;
};

interface ApiPage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as
      { error?: { code?: string; message?: string } } | undefined;
    return {
      code: body?.error?.code || 'API_ERROR',
      message: body?.error?.message || error.message,
    };
  }
  return {
    code: 'API_ERROR',
    message: error instanceof Error ? error.message : 'Falha inesperada na requisição.',
  };
}

function mapFavoriteItem(item: ApiFavoriteItem): FavoriteProduct {
  return { ...mapFeedItem({ ...item, price: Number(item.price) }), status: item.status };
}

async function apiListFavorites(page: number): Promise<Paginated<FavoriteProduct>> {
  try {
    const { data } = await httpClient.get<ApiPage<ApiFavoriteItem>>('/users/me/favorites', {
      params: { page },
    });
    return {
      items: data.items.map(mapFavoriteItem),
      page: data.page,
      pageSize: data.page_size,
      total: data.total,
    };
  } catch (error) {
    throw toApiError(error);
  }
}

async function apiAddFavorite(productId: string): Promise<void> {
  try {
    await httpClient.put(`/users/me/favorites/${productId}`);
  } catch (error) {
    throw toApiError(error);
  }
}

async function apiRemoveFavorite(productId: string): Promise<void> {
  try {
    await httpClient.delete(`/users/me/favorites/${productId}`);
  } catch (error) {
    throw toApiError(error);
  }
}

// ---------------------------------------------------------------------------
// API pública do service.
// ---------------------------------------------------------------------------

/** Favoritos do usuário, mais recente primeiro. Peça vendida ou reservada continua na lista. */
export function listFavorites(userId: string, page = 1): Promise<Paginated<FavoriteProduct>> {
  return useMocks ? mockListFavorites(userId, page) : apiListFavorites(page);
}

/** Favorita a peça. Idempotente: favoritar de novo não muda nada. */
export function addFavorite(userId: string, productId: string): Promise<void> {
  return useMocks ? mockAddFavorite(userId, productId) : apiAddFavorite(productId);
}

/** Tira a peça dos favoritos. Idempotente: tirar o que não está lá não falha. */
export function removeFavorite(userId: string, productId: string): Promise<void> {
  return useMocks ? mockRemoveFavorite(userId, productId) : apiRemoveFavorite(productId);
}

/**
 * Ids de todos os favoritos, percorrendo as páginas até o `total`. É o que o
 * `FavoritesContext` precisa para marcar o coração em qualquer tela.
 */
export async function listFavoriteIds(userId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { items, total } = await listFavorites(userId, page);
    items.forEach((item) => ids.add(item.id));
    if (items.length === 0 || ids.size >= total) break;
  }
  return ids;
}
