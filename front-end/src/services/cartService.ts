import axios from 'axios';
import type { ApiError } from '@/types/auth';
import type { Cart, CartGroup, CartItem } from '@/types/cart';
import type { Product, Store } from '@/types/product';
import { me } from './authService';
import { getProduct } from './catalogService';
import { httpClient } from './httpClient';

/**
 * Service de carrinho (FE-SVC-cart, issue #204).
 *
 * Expõe `getCart`, `addItem` e `removeItem`, todas devolvendo o `Cart`
 * atualizado (agrupado por loja — ver `@/types/cart` para a decisão de não
 * existir total único cruzando lojas).
 *
 * FLAG `VITE_USE_MOCKS` (mesmo padrão de `authService`/`catalogService`):
 *   - ausente ou `'true'` → mock via `sessionStorage`, isolado por usuário;
 *   - `'false'` → API real via `httpClient`.
 *   A leitura acontece uma única vez, em tempo de import do módulo.
 *
 * API real (revisão do PR #228, comentário do Mauro): o agrupamento por loja
 * vem PRONTO do backend (`#147`), não é recalculado aqui — o pagamento é Pix
 * e a tela mostra a chave de cada vendedor, então o subtotal por grupo e a
 * chave só existem se vierem do back; agrupar client-side (como o modo mock
 * faz, sem outra opção) perderia a chave e recalcularia um subtotal que não
 * é fonte de verdade. O valor do subtotal chega em reais (`decimal(10,2)`),
 * não em centavos — convertido para centavos só ao entrar no `Cart` interno,
 * pra manter os dois modos (mock e API) na mesma unidade.
 *
 * Rotas seguem a convenção `/api/users/me/*` para recurso do usuário logado
 * (`.ai/adr/0001-fundacao-http-kit-api.md` §4, no repo do back):
 * `GET /users/me/cart`, `POST /users/me/cart/items`,
 * `DELETE /users/me/cart/items/{product_id}`.
 */

/** `true` quando o módulo deve operar sobre o mock em `sessionStorage`. */
const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

/** Agrupa itens já resolvidos (com `product` completo) pela loja de cada peça. */
function groupByStore(items: CartItem[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();

  for (const item of items) {
    const store: Store = item.product.store;
    let group = groups.get(store.id);
    if (!group) {
      group = { store, items: [], subtotalCents: 0 };
      groups.set(store.id, group);
    }

    group.items.push(item);
    if (!item.unavailable) {
      group.subtotalCents += Math.round(item.product.price * 100);
    }
  }

  return Array.from(groups.values());
}

// ---------------------------------------------------------------------------
// Modo MOCK — lista mínima em sessionStorage, isolada por usuário.
// ---------------------------------------------------------------------------

/** O que é persistido por item: só a referência ao produto e quando foi adicionado. */
interface StoredCartItem {
  productId: string;
  addedAt: string;
}

function cartStorageKey(userId: string): string {
  return `cart:${userId}`;
}

/**
 * Não guardamos nome/preço/loja/status do produto aqui — ficaria desatualizado
 * assim que o produto mudasse no catálogo. O estado atual é sempre buscado via
 * `getProduct` na hora de montar o `Cart`.
 */
function readStoredItems(userId: string): StoredCartItem[] {
  const raw = window.sessionStorage.getItem(cartStorageKey(userId));
  return raw ? (JSON.parse(raw) as StoredCartItem[]) : [];
}

function writeStoredItems(userId: string, items: StoredCartItem[]): void {
  window.sessionStorage.setItem(cartStorageKey(userId), JSON.stringify(items));
}

/**
 * Busca o estado atual de cada produto salvo (em paralelo) e monta o `Cart`.
 * Um `productId` que não existe mais no catálogo (`getProduct` rejeita) é
 * ignorado, sem quebrar o carrinho inteiro por causa de um item órfão.
 */
async function buildCartFromSaved(saved: StoredCartItem[]): Promise<Cart> {
  const settled = await Promise.allSettled(
    saved.map(async (entry): Promise<CartItem> => {
      const product = await getProduct(entry.productId);
      return {
        product,
        addedAt: entry.addedAt,
        unavailable: product.status === 'vendido',
      };
    }),
  );

  const items = settled
    .filter((result): result is PromiseFulfilledResult<CartItem> => result.status === 'fulfilled')
    .map((result) => result.value);

  return { groups: groupByStore(items) };
}

async function mockGetCart(): Promise<Cart> {
  const user = await me();
  return buildCartFromSaved(readStoredItems(user.id));
}

/** RN-46: adicionar uma peça já presente no carrinho é no-op. */
async function mockAddItem(productId: string): Promise<Cart> {
  const user = await me();
  const saved = readStoredItems(user.id);

  if (!saved.some((item) => item.productId === productId)) {
    saved.push({ productId, addedAt: new Date().toISOString() });
    writeStoredItems(user.id, saved);
  }

  return buildCartFromSaved(saved);
}

async function mockRemoveItem(productId: string): Promise<Cart> {
  const user = await me();
  const saved = readStoredItems(user.id).filter((item) => item.productId !== productId);
  writeStoredItems(user.id, saved);
  return buildCartFromSaved(saved);
}

// ---------------------------------------------------------------------------
// Modo API REAL — via httpClient; formato do backend ainda não confirmado.
// ---------------------------------------------------------------------------

/**
 * Forma assumida da resposta de `GET /users/me/cart`, `POST /users/me/cart/items`
 * e `DELETE /users/me/cart/items/{product_id}` — os três devolvem a lista de
 * grupos por loja JÁ atualizada, com `subtotal` (em reais, `decimal(10,2)`)
 * calculado pelo backend, não uma lista flat de itens.
 */
interface ApiCartStore {
  id: number | string;
  name: string;
  city?: string;
  verified?: boolean;
  logo_url?: string;
}

interface ApiCartItem {
  product: {
    id: number | string;
    name: string;
    price: number;
    cover_image_url: string | null;
    store: ApiCartStore;
  };
  added_at: string;
  unavailable: boolean;
}

interface ApiCartGroup {
  store: ApiCartStore;
  items: ApiCartItem[];
  /** Em reais (`decimal(10,2)`), não em centavos — RN do back, ver comentário acima. */
  subtotal: number;
}

function mapApiStore(store: ApiCartStore): Store {
  return {
    id: String(store.id),
    name: store.name,
    city: store.city,
    verified: store.verified,
    logoUrl: store.logo_url,
  };
}

function mapApiCartItem(item: ApiCartItem): CartItem {
  const product: Product = {
    id: String(item.product.id),
    name: item.product.name,
    price: item.product.price,
    coverImageUrl: item.product.cover_image_url,
    store: mapApiStore(item.product.store),
  };

  return { product, addedAt: item.added_at, unavailable: item.unavailable };
}

/** Converte reais (`decimal(10,2)` do back) para centavos, unidade interna de `CartGroup.subtotalCents`. */
function mapApiCartGroup(group: ApiCartGroup): CartGroup {
  return {
    store: mapApiStore(group.store),
    items: group.items.map(mapApiCartItem),
    subtotalCents: Math.round(group.subtotal * 100),
  };
}

/** Normaliza erro do axios pro mesmo `ApiError` do authService — sem `field`, o carrinho não tem campo de formulário. */
function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as
      { error?: { code?: string; message?: string } } | undefined;
    const apiError = body?.error;
    return {
      code: apiError?.code && apiError.code.length > 0 ? apiError.code : 'API_ERROR',
      message: apiError?.message && apiError.message.length > 0 ? apiError.message : error.message,
      field: undefined,
    };
  }

  return {
    code: 'API_ERROR',
    message: error instanceof Error ? error.message : 'Falha inesperada na requisição.',
    field: undefined,
  };
}

async function apiGetCart(): Promise<Cart> {
  try {
    const { data } = await httpClient.get<ApiCartGroup[]>('/users/me/cart');
    return { groups: data.map(mapApiCartGroup) };
  } catch (error) {
    throw toApiError(error);
  }
}

async function apiAddItem(productId: string): Promise<Cart> {
  try {
    const { data } = await httpClient.post<ApiCartGroup[]>('/users/me/cart/items', {
      product_id: productId,
    });
    return { groups: data.map(mapApiCartGroup) };
  } catch (error) {
    throw toApiError(error);
  }
}

async function apiRemoveItem(productId: string): Promise<Cart> {
  try {
    const { data } = await httpClient.delete<ApiCartGroup[]>(`/users/me/cart/items/${productId}`);
    return { groups: data.map(mapApiCartGroup) };
  } catch (error) {
    throw toApiError(error);
  }
}

// ---------------------------------------------------------------------------
// Seleção do modo — resolvida uma vez, no import do módulo.
// ---------------------------------------------------------------------------

/** Devolve o carrinho atual, agrupado por loja. */
export const getCart: () => Promise<Cart> = useMocks ? mockGetCart : apiGetCart;

/** Adiciona a peça ao carrinho (no-op se já estiver presente, RN-46) e devolve o carrinho atualizado. */
export const addItem: (productId: string) => Promise<Cart> = useMocks ? mockAddItem : apiAddItem;

/** Remove a peça do carrinho e devolve o carrinho atualizado. */
export const removeItem: (productId: string) => Promise<Cart> = useMocks
  ? mockRemoveItem
  : apiRemoveItem;
