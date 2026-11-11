import { isAxiosError } from 'axios';
import { products, type MockModerationProduct } from '@/mocks/adminModeration';
import { me } from '@/services/authService';
import { httpClient } from '@/services/httpClient';
import type {
  ListSuspendedParams,
  ModerationMetadata,
  ModerationResult,
  SuspendedProduct,
} from '@/types/adminModeration';
import type { AuthUser } from '@/types/auth';
import type { Paginated, ProductStatus } from '@/types/product';

/**
 * front-end#432: somente as três rotas administrativas fixadas nas issues.
 * A base do httpClient já inclui /api e preserva autenticação/renovação.
 *
 * PROVISÓRIO: DTOs, paginação e regras adicionais do mock seguem o PR #59
 * (head 7b098e0), ainda pendente de integração na análise aprovada.
 */
const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';

export class AdminModerationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus?: number,
    /** Código original recebido; não confundir com os discriminadores locais. */
    public readonly backendCode?: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AdminModerationError';
  }
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
}

/** Snake_case fica restrito à fronteira HTTP; ausência/null é aceita na transição do contrato. */
interface ApiModerationMetadata {
  moderation_reason?: string | null;
  moderated_at?: string | null;
}

interface ApiModerationResult extends ApiModerationMetadata {
  product_id: number | string;
  status: ProductStatus;
}

interface ApiSuspendedProduct extends ApiModerationMetadata {
  id: number | string;
  name: string;
  price: number;
  cover_image_url: string | null;
  status: ProductStatus;
  store: { id: number | string; name: string };
  moderated_by?: { id: number | string; name: string } | null;
}

interface ApiPage<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

function mapMetadata(data: ApiModerationMetadata): ModerationMetadata {
  return {
    moderationReason: data.moderation_reason ?? undefined,
    moderatedAt: data.moderated_at ?? undefined,
  };
}

function mapResult(data: ApiModerationResult): ModerationResult {
  return { productId: String(data.product_id), status: data.status, ...mapMetadata(data) };
}

function mapProduct(data: ApiSuspendedProduct): SuspendedProduct {
  return {
    id: String(data.id),
    name: data.name,
    price: data.price,
    coverImageUrl: data.cover_image_url,
    status: data.status,
    store: { id: String(data.store.id), name: data.store.name },
    ...mapMetadata(data),
    moderatedBy: data.moderated_by
      ? { id: String(data.moderated_by.id), name: data.moderated_by.name }
      : undefined,
  };
}

function toModerationError(error: unknown): AdminModerationError {
  if (error instanceof AdminModerationError) return error;
  const fallback = 'Não foi possível concluir a moderação.';
  if (!isAxiosError<ApiErrorEnvelope>(error)) {
    return new AdminModerationError('INTERNAL_ERROR', fallback);
  }

  const response = error.response;
  if (!response) {
    const network =
      Boolean(error.request) ||
      ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '');
    return new AdminModerationError(
      network ? 'NETWORK_ERROR' : 'INTERNAL_ERROR',
      network ? 'Não foi possível conectar à API. Tente novamente.' : fallback,
    );
  }

  const { code: backendCode, message, fields } = response.data?.error ?? {};
  let code = backendCode;
  if (response.status === 401) code = 'AUTH_REQUIRED';
  if (response.status === 403) code = 'FORBIDDEN';
  if (response.status === 422) {
    // REASON_REQUIRED e NO_IMAGE são códigos LOCAIS; o backend usa VALIDATION_ERROR.
    code = fields?.reason
      ? 'REASON_REQUIRED'
      : fields?.images
        ? 'NO_IMAGE'
        : (backendCode ?? 'VALIDATION_ERROR');
  }
  if (!code) {
    code =
      response.status === 404 ? 'NOT_FOUND' : response.status === 409 ? 'CONFLICT' : 'HTTP_ERROR';
  }
  return new AdminModerationError(code, message ?? fallback, response.status, backendCode, fields);
}

function normalizeReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) {
    const message = 'Informe o motivo da suspensão.';
    // Validação local, antes de enviar HTTP: não houve resposta 422 da API.
    throw new AdminModerationError('REASON_REQUIRED', message, undefined, undefined, {
      reason: message,
    });
  }
  return normalized;
}

// Mock próprio em memória, sem armazenamento de sessão e sem alterar os seeds.
function copyProduct(product: MockModerationProduct): MockModerationProduct {
  return {
    ...product,
    store: { ...product.store },
    images: [...product.images],
    moderatedBy: product.moderatedBy ? { ...product.moderatedBy } : undefined,
  };
}

const mockState = new Map(
  useMocks ? products.map((product) => [product.id, copyProduct(product)] as const) : [],
);

async function requireMockAdmin(): Promise<AuthUser> {
  let user: AuthUser;
  try {
    user = await me();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'AUTH_REQUIRED') {
      throw new AdminModerationError(
        'AUTH_REQUIRED',
        'message' in error && typeof error.message === 'string'
          ? error.message
          : 'É necessário estar autenticado.',
        401,
        'AUTH_REQUIRED',
      );
    }
    throw toModerationError(error);
  }
  if (!user.is_admin) {
    throw new AdminModerationError(
      'FORBIDDEN',
      'Ação restrita a administradores.',
      403,
      'ADMIN_REQUIRED',
    );
  }
  return user;
}

function findMockProduct(id: string): MockModerationProduct {
  const product = mockState.get(id);
  if (!product) {
    throw new AdminModerationError(
      'PRODUCT_NOT_FOUND',
      'Peça não encontrada.',
      404,
      'PRODUCT_NOT_FOUND',
    );
  }
  return product;
}

function mockResult(product: MockModerationProduct): ModerationResult {
  return {
    productId: product.id,
    status: product.status,
    moderationReason: product.moderationReason,
    moderatedAt: product.moderatedAt,
  };
}

function mockItem(product: MockModerationProduct): SuspendedProduct {
  return {
    id: product.id,
    name: product.name,
    price: product.price,
    status: product.status,
    coverImageUrl: product.coverImageUrl,
    store: { ...product.store },
    moderationReason: product.moderationReason,
    moderatedAt: product.moderatedAt,
    moderatedBy: product.moderatedBy ? { ...product.moderatedBy } : undefined,
  };
}

async function mockSuspend(id: string, reason: string): Promise<ModerationResult> {
  const admin = await requireMockAdmin();
  const normalized = normalizeReason(reason);
  // Limite PROVISÓRIO de UnpublishRequest no PR #59. Na API, quem o valida é o backend.
  if (Array.from(normalized).length > 500) {
    throw new AdminModerationError(
      'REASON_REQUIRED',
      'Dados inválidos na requisição.',
      422,
      'VALIDATION_ERROR',
      {
        reason: 'O motivo deve ter no máximo 500 caracteres.',
      },
    );
  }
  const product = findMockProduct(id);
  if (
    product.status === 'vendido' ||
    product.status === 'reservado' ||
    product.status === 'rascunho'
  ) {
    const code = product.status === 'vendido' ? 'PRODUCT_SOLD' : 'PRODUCT_NOT_EDITABLE';
    throw new AdminModerationError(
      code,
      'O estado atual da peça não permite suspensão.',
      409,
      code,
    );
  }
  const next: MockModerationProduct = {
    ...product,
    status: 'despublicado',
    moderationReason: normalized,
    // Geração UTC sem sufixo, como utcnow_naive do backend; datas da API não são convertidas.
    moderatedAt: new Date().toISOString().slice(0, -1),
    moderatedBy: { id: admin.id, name: admin.name },
  };
  mockState.set(id, next);
  return mockResult(next);
}

async function mockRestore(id: string): Promise<ModerationResult> {
  await requireMockAdmin();
  const product = findMockProduct(id);
  if (product.moderatedAt == null) {
    throw new AdminModerationError(
      'PRODUCT_NOT_SUSPENDED',
      'Esta peça não está suspensa pela moderação.',
      409,
      'PRODUCT_NOT_SUSPENDED',
    );
  }
  if (product.images.length === 0) {
    throw new AdminModerationError(
      'NO_IMAGE',
      'Devolver à vitrine exige ao menos uma foto.',
      422,
      'VALIDATION_ERROR',
      {
        images: 'A peça precisa de ao menos uma foto para voltar.',
      },
    );
  }
  const next: MockModerationProduct = {
    ...product,
    status: 'ativo',
    moderationReason: undefined,
    moderatedAt: undefined,
    moderatedBy: undefined,
  };
  mockState.set(id, next);
  return mockResult(next);
}

async function mockList(params: ListSuspendedParams): Promise<Paginated<SuspendedProduct>> {
  await requireMockAdmin();
  const { page = 1, pageSize = 20 } = params;
  const fields: Record<string, string> = {};
  if (!Number.isInteger(page) || page < 1)
    fields.page = 'A página deve ser um inteiro maior ou igual a 1.';
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    fields.page_size = 'O tamanho da página deve ser um inteiro entre 1 e 100.';
  }
  if (Object.keys(fields).length > 0) {
    throw new AdminModerationError(
      'VALIDATION_ERROR',
      'Dados inválidos na requisição.',
      422,
      'VALIDATION_ERROR',
      fields,
    );
  }
  // Critério do PR #59: moderated_at IS NOT NULL; despublicado também pode ser uma pausa do vendedor.
  const suspended = [...mockState.values()]
    .filter((product) => product.moderatedAt != null)
    .sort(
      (a, b) =>
        b.moderatedAt!.localeCompare(a.moderatedAt!) ||
        b.id.localeCompare(a.id, undefined, { numeric: true }),
    );
  const start = (page - 1) * pageSize;
  return {
    items: suspended.slice(start, start + pageSize).map(mockItem),
    page,
    pageSize,
    total: suspended.length,
  };
}

/** Suspende com motivo obrigatório. API e mock retornam somente o resultado parcial. */
export async function suspendProduct(id: string, reason: string): Promise<ModerationResult> {
  if (useMocks) return mockSuspend(id, reason);
  const normalized = normalizeReason(reason);
  try {
    const { data } = await httpClient.post<ApiModerationResult>(`/admin/products/${id}/unpublish`, {
      reason: normalized,
    });
    return mapResult(data);
  } catch (error) {
    throw toModerationError(error);
  }
}

/** Devolve à vitrine pela rota administrativa; a API continua responsável por exigir foto. */
export async function restoreProduct(id: string): Promise<ModerationResult> {
  if (useMocks) return mockRestore(id);
  try {
    const { data } = await httpClient.post<ApiModerationResult>(`/admin/products/${id}/publish`);
    return mapResult(data);
  } catch (error) {
    throw toModerationError(error);
  }
}

/** A rota moderated=true define os membros da lista; metadados opcionais não os excluem. */
export async function listSuspended(
  params: ListSuspendedParams = {},
): Promise<Paginated<SuspendedProduct>> {
  if (useMocks) return mockList(params);
  try {
    const { data } = await httpClient.get<ApiPage<ApiSuspendedProduct>>('/admin/products', {
      params: { moderated: true, page: params.page, page_size: params.pageSize },
    });
    return {
      items: data.items.map(mapProduct),
      page: data.page,
      pageSize: data.page_size,
      total: data.total,
    };
  } catch (error) {
    throw toModerationError(error);
  }
}
