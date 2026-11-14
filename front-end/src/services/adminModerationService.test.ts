import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { AuthUser } from '@/types/auth';
import type { Paginated, Product, ProductStatus } from '@/types/product';
import type {
  ListSuspendedParams,
  ModerationMetadata,
  ModerationResult,
  SuspendedProduct,
} from '@/types/adminModeration';

/**
 * RED da front-end#432. Só este arquivo é criado nesta etapa.
 *
 * Definitivo nas issues #432/#327: três endpoints administrativos, reason
 * obrigatório, 401/403, 409 de reservado/vendido e 422 de motivo/foto.
 *
 * PROVISÓRIO: respostas snake_case, page/page_size, critério moderated_at e
 * PRODUCT_NOT_SUSPENDED seguem o PR vintex-prod#59 no head 7b098e0, ainda NÃO
 * integrado. Datas são strings UTC sem timezone, preservadas pelo service.
 *
 * Os imports de service/tipos ainda não existem: falha de resolução bloqueia
 * os cenários, não comprova que cada regra de negócio falhou. Não criar stubs
 * de produção para contornar esse RED.
 */
type ModerationService = typeof import('./adminModerationService');
type HttpModule = typeof import('./httpClient');
type Operation = 'suspend' | 'restore' | 'list';

const PRODUCT_ID = '43201';
const REASON = 'As fotos não correspondem à peça.';
const MODERATED_AT = '2026-11-10T12:30:00';
const ADMIN: AuthUser = {
  id: '43290',
  name: 'Administradora de teste',
  email: 'admin@example.test',
  is_admin: true,
  is_seller: false,
};
const OWNER: AuthUser = { ...ADMIN, id: '43291', is_admin: false, is_seller: true };

// Respostas de referência PROVISÓRIAS: schemas do PR #59, não da develop.
const API_SUSPENSION = {
  product_id: 43201,
  status: 'despublicado',
  moderation_reason: REASON,
  moderated_at: MODERATED_AT,
};
const API_RESTORATION = {
  product_id: 43201,
  status: 'ativo',
  moderation_reason: null,
  moderated_at: null,
};
const API_PRODUCT = {
  id: 43201,
  name: 'Jaqueta de teste',
  price: 149.9,
  cover_image_url: 'https://images.example.test/jaqueta.jpg',
  status: 'despublicado',
  store: { id: 43280, name: 'Brechó de teste' },
  moderation_reason: REASON,
  moderated_at: MODERATED_AT,
  moderated_by: { id: 43290, name: ADMIN.name },
};

interface RequestRecord {
  method?: string;
  url?: string;
  baseURL?: string;
  data: unknown;
  params: Record<string, unknown> | undefined;
  authorization: unknown;
  returnTo: unknown;
}

let service: ModerationService;
let http: HttpModule | undefined;

function apiPage(items: unknown[] = [API_PRODUCT], page = 1, pageSize = 20, total = items.length) {
  return { items, page, page_size: pageSize, total };
}

/** Erro Axios real para exercitar também os interceptors, sem acesso à rede. */
function httpError(
  config: InternalAxiosRequestConfig,
  status: number,
  error?: { code: string; message: string; fields?: Record<string, string>; return_to?: string },
) {
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, undefined, {
    status,
    statusText: 'Error',
    headers: {},
    config,
    data: error ? { error } : {},
  });
}

/** Mesmo mecanismo das suítes vizinhas: substitui só o adapter do httpClient. */
function stubAdapter(respond: (config: InternalAxiosRequestConfig, attempt: number) => unknown) {
  if (!http) throw new Error('Cliente HTTP do teste não inicializado.');
  const calls: RequestRecord[] = [];
  http.httpClient.defaults.adapter = (config) => {
    calls.push({
      method: config.method,
      url: config.url,
      baseURL: config.baseURL,
      data: config.data,
      params: config.params,
      authorization: config.headers.get('Authorization'),
      returnTo: config.headers.get('X-Return-To'),
    });
    const result = respond(config, calls.length);
    return result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve({ data: result, status: 200, statusText: 'OK', headers: {}, config });
  };
  return calls;
}

function invoke(operation: Operation): Promise<unknown> {
  switch (operation) {
    case 'suspend':
      return service.suspendProduct(PRODUCT_ID, REASON);
    case 'restore':
      return service.restoreProduct(PRODUCT_ID);
    case 'list':
      return service.listSuspended();
  }
}

async function expectServiceError(promise: Promise<unknown>, details: Record<string, unknown>) {
  await expect(promise).rejects.toBeInstanceOf(service.AdminModerationError);
  await expect(promise).rejects.toMatchObject(details);
}

beforeEach(() => {
  vi.resetModules();
  vi.doUnmock('@/services/authService');
  vi.doUnmock('@/mocks/adminModeration');
  vi.stubEnv('VITE_USE_MOCKS', 'false');
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  http?.setAuthTokenProvider(() => null);
  http?.setOnAuthRequired(null);
  http?.setSessionRefresher(null);
  http = undefined;
  vi.doUnmock('@/services/authService');
  vi.doUnmock('@/mocks/adminModeration');
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('adminModerationService — API; respostas provisórias do PR #59', () => {
  beforeEach(async () => {
    http = await import('./httpClient');
    http.httpClient.defaults.baseURL = 'https://api.example.test/api';
    http.setAuthTokenProvider(() => 'test-access-token');
    http.setSessionRefresher(null);
    http.setOnAuthRequired(vi.fn());
    // Nenhuma chamada pode escapar para a rede, mesmo se um caso esquecer o adapter.
    stubAdapter(() => new Error('Requisição HTTP não prevista pelo teste.'));
    const auth = await import('./authService');
    // API real deve confiar no backend e no httpClient, sem uma quarta rota.
    vi.spyOn(auth, 'me').mockRejectedValue(new Error('A API não deve consultar me() aqui.'));
    service = await import('./adminModerationService');
  });

  it('suspende com POST administrativo e body reason, sem duplicar /api nem usar a rota do vendedor', async () => {
    const calls = stubAdapter(() => API_SUSPENSION);

    await service.suspendProduct(PRODUCT_ID, REASON);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'post',
      url: '/admin/products/43201/unpublish',
      baseURL: 'https://api.example.test/api',
    });
    expect(JSON.parse(calls[0].data as string)).toEqual({ reason: REASON });
  });

  it('apara somente as pontas do motivo, preservando seu conteúdo', async () => {
    const calls = stubAdapter(() => ({
      ...API_SUSPENSION,
      moderation_reason: 'Fotos  incorretas.',
    }));

    await service.suspendProduct(PRODUCT_ID, '  Fotos  incorretas.  ');

    expect(JSON.parse(calls[0].data as string)).toEqual({ reason: 'Fotos  incorretas.' });
  });

  it.each(['', '   ', '\t\n'])('recusa motivo inválido %j antes de enviar HTTP', async (reason) => {
    const calls = stubAdapter(() => API_SUSPENSION);

    await expectServiceError(service.suspendProduct(PRODUCT_ID, reason), {
      code: 'REASON_REQUIRED', // Discriminador LOCAL, já usado por adminReceiptService.
      message: expect.any(String),
      httpStatus: undefined,
      backendCode: undefined,
    });
    expect(calls).toHaveLength(0);
  });

  it('mapeia apenas a resposta parcial da suspensão, com ID string e data intacta', async () => {
    stubAdapter(() => API_SUSPENSION);

    const result = await service.suspendProduct(PRODUCT_ID, REASON);

    expect(result).toMatchObject({
      productId: PRODUCT_ID,
      status: 'despublicado',
      moderationReason: REASON,
      moderatedAt: MODERATED_AT,
    });
    expect(result).not.toHaveProperty('name');
    expect(result).not.toHaveProperty('price');
    expect(result).not.toHaveProperty('store');
    expect(result).not.toHaveProperty('moderatedBy'); // Autor só existe na listagem do PR.
    expect(result).not.toHaveProperty('product_id');
  });

  it.each<Operation>(['suspend', 'restore', 'list'])(
    '%s preserva Bearer e X-Return-To pelo cliente existente',
    async (operation) => {
      window.history.replaceState({}, '', '/admin/moderation?page=2');
      const calls = stubAdapter(() =>
        operation === 'list'
          ? apiPage()
          : operation === 'restore'
            ? API_RESTORATION
            : API_SUSPENSION,
      );

      await invoke(operation);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        authorization: 'Bearer test-access-token',
        returnTo: '/admin/moderation?page=2',
      });
      const auth = await import('./authService');
      expect(auth.me).not.toHaveBeenCalled();
    },
  );

  it('401 AUTH_REQUIRED preserva retorno ao login e os dados do erro sem sessão', async () => {
    const onAuthRequired = vi.fn();
    http!.setAuthTokenProvider(() => null);
    http!.setOnAuthRequired(onAuthRequired);
    const calls = stubAdapter((config) =>
      httpError(config, 401, {
        code: 'AUTH_REQUIRED',
        message: 'É necessário estar autenticado.',
        return_to: '/admin/moderation?page=2',
      }),
    );

    await expectServiceError(service.suspendProduct(PRODUCT_ID, REASON), {
      code: 'AUTH_REQUIRED',
      httpStatus: 401,
      backendCode: 'AUTH_REQUIRED',
      message: 'É necessário estar autenticado.',
    });
    expect(calls[0].authorization).toBeUndefined();
    expect(onAuthRequired).toHaveBeenCalledWith('/admin/moderation?page=2');
    expect(window.sessionStorage.getItem(http!.REDIRECT_STORAGE_KEY)).toBe(
      '/admin/moderation?page=2',
    );
  });

  it('renova a sessão e repete a mesma suspensão com token novo e body preservado', async () => {
    const onAuthRequired = vi.fn();
    const refresh = vi
      .fn<NonNullable<Parameters<HttpModule['setSessionRefresher']>[0]>>()
      .mockResolvedValue({ estado: 'renovada', token: 'test-renewed-token' });
    http!.setOnAuthRequired(onAuthRequired);
    http!.setSessionRefresher(refresh);
    const calls = stubAdapter((config, attempt) =>
      attempt === 1
        ? httpError(config, 401, { code: 'AUTH_REQUIRED', message: 'Sessão expirada.' })
        : API_SUSPENSION,
    );

    await expect(service.suspendProduct(PRODUCT_ID, REASON)).resolves.toMatchObject({
      productId: PRODUCT_ID,
      status: 'despublicado',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(calls.map((call) => call.authorization)).toEqual([
      'Bearer test-access-token',
      'Bearer test-renewed-token',
    ]);
    expect(calls.map((call) => [call.method, call.url, call.data])).toEqual([
      ['post', '/admin/products/43201/unpublish', JSON.stringify({ reason: REASON })],
      ['post', '/admin/products/43201/unpublish', JSON.stringify({ reason: REASON })],
    ]);
    expect(onAuthRequired).not.toHaveBeenCalled();
  });

  it('falha transitória no refresh rejeita de forma tratável sem encerrar a sessão', async () => {
    const onAuthRequired = vi.fn();
    http!.setOnAuthRequired(onAuthRequired);
    http!.setSessionRefresher(async () => ({ estado: 'falha-transitoria' }));
    const calls = stubAdapter((config) =>
      httpError(config, 401, { code: 'AUTH_REQUIRED', message: 'Sessão expirada.' }),
    );

    await expectServiceError(service.suspendProduct(PRODUCT_ID, REASON), {
      httpStatus: 401,
      backendCode: 'AUTH_REQUIRED',
    });
    expect(calls).toHaveLength(1);
    expect(onAuthRequired).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(http!.REDIRECT_STORAGE_KEY)).toBeNull();
  });

  describe.each<Operation>(['suspend', 'restore', 'list'])('erros HTTP de %s', (operation) => {
    it.each([
      { status: 401, backendCode: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED' },
      { status: 403, backendCode: 'ADMIN_REQUIRED', code: 'FORBIDDEN' },
      { status: 404, backendCode: 'PRODUCT_NOT_FOUND', code: 'PRODUCT_NOT_FOUND' },
      { status: 404, backendCode: 'NOT_FOUND', code: 'NOT_FOUND' },
    ])(
      'preserva HTTP $status, negócio $backendCode e mensagem',
      async ({ status, backendCode, code }) => {
        const message = `Mensagem do backend: ${backendCode}.`;
        const calls = stubAdapter((config) =>
          httpError(config, status, { code: backendCode, message }),
        );

        await expectServiceError(invoke(operation), {
          code,
          httpStatus: status,
          backendCode,
          message,
        });
        expect(calls).toHaveLength(1);
      },
    );
  });

  it.each([
    { state: 'reservado', code: 'PRODUCT_NOT_EDITABLE' },
    { state: 'vendido', code: 'PRODUCT_SOLD' },
  ])('preserva o código de negócio do 409 de peça $state', async ({ state, code }) => {
    const message = `Peça ${state} não pode ser suspensa.`;
    stubAdapter((config) => httpError(config, 409, { code, message }));

    await expectServiceError(service.suspendProduct(PRODUCT_ID, REASON), {
      code,
      httpStatus: 409,
      backendCode: code,
      message,
    });
  });

  it('preserva o 422 do backend para reason sem perder mensagem e fields', async () => {
    const fields = { reason: 'Motivo rejeitado pelo backend.' };
    stubAdapter((config) =>
      httpError(config, 422, {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos na requisição.',
        fields,
      }),
    );

    await expectServiceError(service.suspendProduct(PRODUCT_ID, REASON), {
      code: 'REASON_REQUIRED', // Local; o backend continua sendo VALIDATION_ERROR.
      httpStatus: 422,
      backendCode: 'VALIDATION_ERROR',
      message: 'Dados inválidos na requisição.',
      fields,
    });
  });

  it('restaura com POST administrativo /publish, sem body obrigatório ou rota republish', async () => {
    const calls = stubAdapter(() => API_RESTORATION);

    const result = await service.restoreProduct(PRODUCT_ID);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'post', url: '/admin/products/43201/publish' });
    expect(calls[0].data).toBeUndefined();
    expect(result).toMatchObject({ productId: PRODUCT_ID, status: 'ativo' });
    expect(result).not.toHaveProperty('images');
    expect(result).not.toHaveProperty('store');
  });

  it('a resposta da restauração não reaproveita os metadados da suspensão anterior', async () => {
    const calls = stubAdapter((config) =>
      config.url?.endsWith('/unpublish') ? API_SUSPENSION : API_RESTORATION,
    );
    const suspended = await service.suspendProduct(PRODUCT_ID, REASON);

    const restored = await service.restoreProduct(PRODUCT_ID);

    expect(restored.productId).toBe(PRODUCT_ID);
    expect(restored.status).toBe('ativo');
    expect(restored.moderationReason).toBeUndefined();
    expect(restored.moderatedAt).toBeUndefined();
    expect(restored).not.toBe(suspended);
    expect(suspended.moderationReason).toBe(REASON);
    expect(calls).toHaveLength(2);
  });

  it('restauração sem foto distingue images de motivo inválido no 422', async () => {
    const fields = { images: 'A peça precisa de ao menos uma foto para voltar.' };
    stubAdapter((config) =>
      httpError(config, 422, {
        code: 'VALIDATION_ERROR',
        message: 'Devolver à vitrine exige ao menos uma foto.',
        fields,
      }),
    );

    await expectServiceError(service.restoreProduct(PRODUCT_ID), {
      code: 'NO_IMAGE', // Local, como sellerProductService; não é código do backend.
      httpStatus: 422,
      backendCode: 'VALIDATION_ERROR',
      message: 'Devolver à vitrine exige ao menos uma foto.',
      fields,
    });
  });

  it('PR #59 provisório: restauração inválida preserva PRODUCT_NOT_SUSPENDED', async () => {
    stubAdapter((config) =>
      httpError(config, 409, {
        code: 'PRODUCT_NOT_SUSPENDED',
        message: 'Esta peça não está suspensa pela moderação.',
      }),
    );

    await expectServiceError(service.restoreProduct(PRODUCT_ID), {
      code: 'PRODUCT_NOT_SUSPENDED',
      httpStatus: 409,
      backendCode: 'PRODUCT_NOT_SUSPENDED',
    });
  });

  it('lista com moderated=true mesmo sem parâmetros públicos', async () => {
    const calls = stubAdapter(() => apiPage());

    await service.listSuspended();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'get',
      url: '/admin/products',
      params: { moderated: true },
    });
  });

  it('PR #59 provisório: traduz pageSize em page_size e preserva a paginação recebida', async () => {
    const calls = stubAdapter(() => apiPage([API_PRODUCT], 2, 5, 11));

    const result = await service.listSuspended({ page: 2, pageSize: 5 });

    expect(calls[0].params).toEqual({ moderated: true, page: 2, page_size: 5 });
    expect(result).toMatchObject({ page: 2, pageSize: 5, total: 11 });
    expect(result.items).toHaveLength(1);
    expect(result).not.toHaveProperty('page_size');
  });

  it('mapeia IDs, preço, nome, loja, status, capa e autor sem inventar campos', async () => {
    stubAdapter(() => apiPage());

    const { items } = await service.listSuspended();

    expect(items).toEqual([
      {
        id: PRODUCT_ID,
        name: API_PRODUCT.name,
        price: 149.9,
        status: 'despublicado',
        coverImageUrl: API_PRODUCT.cover_image_url,
        store: { id: '43280', name: API_PRODUCT.store.name },
        moderationReason: REASON,
        moderatedAt: MODERATED_AT,
        moderatedBy: { id: ADMIN.id, name: ADMIN.name },
      },
    ]);
  });

  it.each(['omitidos', 'null'] as const)(
    'aceita motivo, data e autor %s sem descartar um registro retornado pela rota administrativa',
    async (metadata) => {
      // A associação à lista vem da rota moderated=true; campos opcionais não
      // são uma razão para o front filtrar registros que o backend retornou.
      const product: Partial<typeof API_PRODUCT> = { ...API_PRODUCT };
      delete product.moderation_reason;
      delete product.moderated_at;
      delete product.moderated_by;
      const optional =
        metadata === 'null'
          ? { moderation_reason: null, moderated_at: null, moderated_by: null }
          : {};
      stubAdapter(() => apiPage([{ ...product, cover_image_url: null, ...optional }]));

      const result = await service.listSuspended();

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: PRODUCT_ID,
        status: 'despublicado',
        coverImageUrl: null,
      });
      expect(result.items[0].moderationReason).toBeUndefined();
      expect(result.items[0].moderatedAt).toBeUndefined();
      expect(result.items[0].moderatedBy).toBeUndefined();
    },
  );

  it('devolve lista vazia sem fabricar produtos ou metadados', async () => {
    stubAdapter(() => apiPage([]));

    await expect(service.listSuspended()).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
  });

  it('não transforma 422 de paginação em motivo vazio', async () => {
    const fields = { page: 'A página deve ser maior ou igual a 1.' };
    stubAdapter((config) =>
      httpError(config, 422, {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos na requisição.',
        fields,
      }),
    );

    await expectServiceError(service.listSuspended({ page: 0 }), {
      code: 'VALIDATION_ERROR',
      httpStatus: 422,
      backendCode: 'VALIDATION_ERROR',
      fields,
    });
  });

  it.each([401, 403, 404, 409, 422])(
    'HTTP %s sem envelope continua discriminável pelo status',
    async (status) => {
      stubAdapter((config) => httpError(config, status));

      await expectServiceError(service.suspendProduct(PRODUCT_ID, REASON), {
        httpStatus: status,
        code: expect.any(String),
        message: expect.any(String),
        backendCode: undefined,
      });
    },
  );

  it('preserva código de negócio desconhecido em vez de reduzi-lo a um conflito genérico', async () => {
    // Código sintético de teste para compatibilidade futura, não código declarado do backend.
    stubAdapter((config) =>
      httpError(config, 409, {
        code: 'TEST_FUTURE_CONFLICT',
        message: 'Conflito retornado pela API.',
      }),
    );

    await expectServiceError(service.suspendProduct(PRODUCT_ID, REASON), {
      code: 'TEST_FUTURE_CONFLICT',
      backendCode: 'TEST_FUTURE_CONFLICT',
      httpStatus: 409,
      message: 'Conflito retornado pela API.',
    });
  });

  it('falha de rede é local e não inventa HTTP status nem backendCode', async () => {
    stubAdapter(() => new AxiosError('Network Error', 'ERR_NETWORK'));

    await expectServiceError(service.listSuspended(), {
      code: 'NETWORK_ERROR',
      httpStatus: undefined,
      backendCode: undefined,
      message: expect.any(String),
    });
  });

  it('preserva o envelope de erro interno HTTP', async () => {
    stubAdapter((config) =>
      httpError(config, 500, {
        code: 'INTERNAL_ERROR',
        message: 'Erro interno. Tente novamente mais tarde.',
      }),
    );

    await expectServiceError(service.restoreProduct(PRODUCT_ID), {
      code: 'INTERNAL_ERROR',
      backendCode: 'INTERNAL_ERROR',
      httpStatus: 500,
      message: 'Erro interno. Tente novamente mais tarde.',
    });
  });

  it('erro inesperado não é apresentado como falha de rede ou resposta HTTP', async () => {
    stubAdapter(() => new Error('Falha inesperada no adapter de teste.'));

    await expectServiceError(service.listSuspended(), {
      code: 'INTERNAL_ERROR',
      httpStatus: undefined,
      backendCode: undefined,
      message: expect.any(String),
    });
  });
});

// Fixtures exclusivamente deste teste. O futuro arquivo de mocks fornecerá
// `products`, como mocks/products.ts; o service manterá seu próprio estado em
// memória. doMock só substitui a origem das fixtures, nunca os métodos testados.
interface MockProductFixture extends Product {
  status: ProductStatus;
  images: string[];
  moderationReason?: string;
  moderatedAt?: string;
  moderatedBy?: { id: string; name: string };
}

function mockFixtures(): MockProductFixture[] {
  const product = (id: string, status: ProductStatus): MockProductFixture => ({
    id,
    status,
    name: `Peça ${id}`,
    price: 90,
    coverImageUrl: `https://images.example.test/${id}.jpg`,
    store: { id: '43280', name: 'Loja da proprietária de teste' },
    images: [`https://images.example.test/${id}.jpg`],
  });
  const moderation = {
    moderationReason: REASON,
    moderatedAt: MODERATED_AT,
    moderatedBy: { id: ADMIN.id, name: ADMIN.name },
  };
  return [
    product(PRODUCT_ID, 'ativo'),
    { ...product('43202', 'despublicado'), ...moderation },
    product('43203', 'despublicado'), // Pausada pelo vendedor; sem moderação.
    product('43204', 'reservado'),
    product('43205', 'vendido'),
    { ...product('43206', 'despublicado'), ...moderation, images: [], coverImageUrl: null },
    product('43207', 'rascunho'),
  ];
}

describe('adminModerationService — mock em memória, fixtures locais', () => {
  const me = vi.fn<() => Promise<AuthUser>>();
  let fixtures: MockProductFixture[];

  beforeEach(async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'true');
    fixtures = mockFixtures();
    me.mockReset();
    me.mockResolvedValue({ ...ADMIN });
    vi.doMock('@/services/authService', () => ({ me }));
    vi.doMock('@/mocks/adminModeration', () => ({ products: fixtures }));
    http = await import('./httpClient');
    stubAdapter(() => new Error('O modo mock não pode enviar HTTP.'));
    service = await import('./adminModerationService');
  });

  it('lista só suspensas pela admin; ativa e pausada pelo vendedor ficam fora', async () => {
    const calls = stubAdapter(() => new Error('HTTP indevido no mock.'));

    const result = await service.listSuspended();

    expect(result.items.map((item: SuspendedProduct) => item.id).sort()).toEqual([
      '43202',
      '43206',
    ]);
    expect(result.total).toBe(2);
    expect(result.items.every((item: SuspendedProduct) => item.status === 'despublicado')).toBe(
      true,
    );
    expect(calls).toHaveLength(0);
  });

  it('suspensão válida aparece na listagem com motivo, data e autor da sessão', async () => {
    const result = await service.suspendProduct(PRODUCT_ID, REASON);
    const listed = await service.listSuspended();

    expect(result).toMatchObject({
      productId: PRODUCT_ID,
      status: 'despublicado',
      moderationReason: REASON,
    });
    expect(Number.isNaN(Date.parse(result.moderatedAt!))).toBe(false);
    expect(listed.total).toBe(3);
    expect(listed.items.find((item: SuspendedProduct) => item.id === PRODUCT_ID)).toMatchObject({
      status: 'despublicado',
      moderationReason: REASON,
      moderatedAt: result.moderatedAt,
      moderatedBy: { id: ADMIN.id, name: ADMIN.name },
    });
  });

  it('restauração válida remove a suspensão da lista e limpa motivo/data do resultado', async () => {
    await service.suspendProduct(PRODUCT_ID, REASON);

    const restored = await service.restoreProduct(PRODUCT_ID);
    const listed = await service.listSuspended();

    expect(restored).toMatchObject({ productId: PRODUCT_ID, status: 'ativo' });
    expect(restored.moderationReason).toBeUndefined();
    expect(restored.moderatedAt).toBeUndefined();
    expect(listed.items.some((item: SuspendedProduct) => item.id === PRODUCT_ID)).toBe(false);
    expect(listed.total).toBe(2);
  });

  it.each(['', '   ', '\t\n'])(
    'motivo %j não altera a listagem nem impede uma suspensão válida posterior',
    async (reason) => {
      const before = await service.listSuspended();

      await expectServiceError(service.suspendProduct(PRODUCT_ID, reason), {
        code: 'REASON_REQUIRED',
      });

      expect(await service.listSuspended()).toEqual(before);
      await expect(service.suspendProduct(PRODUCT_ID, REASON)).resolves.toMatchObject({
        status: 'despublicado',
      });
      expect((await service.listSuspended()).total).toBe(before.total + 1);
    },
  );

  it.each([
    { id: '43204', state: 'reservado', code: 'PRODUCT_NOT_EDITABLE' },
    { id: '43205', state: 'vendido', code: 'PRODUCT_SOLD' },
  ])('peça $state recusa suspensão com 409 sem mudar estado', async ({ id, code }) => {
    const before = await service.listSuspended();
    const seeds = structuredClone(fixtures);

    await expectServiceError(service.suspendProduct(id, REASON), { code, httpStatus: 409 });

    expect(await service.listSuspended()).toEqual(before);
    // Segunda tentativa também conflita: não houve transição silenciosa para ativo/despublicado.
    await expectServiceError(service.suspendProduct(id, REASON), { code, httpStatus: 409 });
    expect(fixtures).toEqual(seeds);
  });

  it('peça suspensa sem foto recusa restauração com 422 e mantém motivo/data/autor', async () => {
    const before = await service.listSuspended();

    await expectServiceError(service.restoreProduct('43206'), {
      code: 'NO_IMAGE',
      httpStatus: 422,
      fields: { images: expect.any(String) },
    });

    expect(await service.listSuspended()).toEqual(before);
  });

  describe.each<Operation>(['suspend', 'restore', 'list'])(
    'autorização mock de %s',
    (operation) => {
      it.each([
        { role: 'usuária comum', user: { ...OWNER, id: '43292', is_seller: false } },
        { role: 'proprietária da peça', user: OWNER },
      ])('$role recebe 403 sem alterar estado', async ({ user }) => {
        const before = await service.listSuspended();
        me.mockResolvedValue({ ...user });

        await expectServiceError(invoke(operation), { code: 'FORBIDDEN', httpStatus: 403 });

        me.mockResolvedValue({ ...ADMIN });
        expect(await service.listSuspended()).toEqual(before);
      });

      it('sem sessão recebe 401 e preserva estado', async () => {
        const before = await service.listSuspended();
        me.mockRejectedValue({ code: 'AUTH_REQUIRED', message: 'É necessário estar autenticado.' });

        await expectServiceError(invoke(operation), { code: 'AUTH_REQUIRED', httpStatus: 401 });

        me.mockResolvedValue({ ...ADMIN });
        expect(await service.listSuspended()).toEqual(before);
      });
    },
  );

  it.each<Operation>(['suspend', 'restore'])(
    '%s de ID desconhecido devolve 404 sem alterar a lista',
    async (operation) => {
      const before = await service.listSuspended();
      const request =
        operation === 'suspend'
          ? service.suspendProduct('inexistente', REASON)
          : service.restoreProduct('inexistente');

      await expectServiceError(request, { code: 'PRODUCT_NOT_FOUND', httpStatus: 404 });

      expect(await service.listSuspended()).toEqual(before);
    },
  );

  it('PR #59 provisório: restaurar ativa ou pausada pelo vendedor dá PRODUCT_NOT_SUSPENDED', async () => {
    const before = await service.listSuspended();

    for (const id of [PRODUCT_ID, '43203']) {
      await expectServiceError(service.restoreProduct(id), {
        code: 'PRODUCT_NOT_SUSPENDED',
        httpStatus: 409,
      });
    }

    expect(await service.listSuspended()).toEqual(before);
  });

  it('PR #59 provisório: rascunho recusa suspensão sem virar produto publicável', async () => {
    const before = await service.listSuspended();

    await expectServiceError(service.suspendProduct('43207', REASON), {
      code: 'PRODUCT_NOT_EDITABLE',
      httpStatus: 409,
    });

    expect(await service.listSuspended()).toEqual(before);
  });

  it('PR #59 provisório: nova suspensão atualiza o motivo sem duplicar o produto', async () => {
    await service.suspendProduct('43202', 'Novo motivo de teste.');

    const listed = await service.listSuspended();

    expect(listed.total).toBe(2);
    expect(listed.items.filter((item: SuspendedProduct) => item.id === '43202')).toHaveLength(1);
    expect(
      listed.items.find((item: SuspendedProduct) => item.id === '43202')?.moderationReason,
    ).toBe('Novo motivo de teste.');
  });

  it('PR #59 provisório: paginação mantém total e ordena por data/ID decrescentes', async () => {
    const first = await service.listSuspended({ page: 1, pageSize: 1 });
    const second = await service.listSuspended({ page: 2, pageSize: 1 });
    const beyond = await service.listSuspended({ page: 3, pageSize: 1 });

    expect(first).toMatchObject({ page: 1, pageSize: 1, total: 2 });
    expect(second).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(first.items.map((item: SuspendedProduct) => item.id)).toEqual(['43206']);
    expect(second.items.map((item: SuspendedProduct) => item.id)).toEqual(['43202']);
    expect(beyond).toEqual({ items: [], page: 3, pageSize: 1, total: 2 });
  });

  it('remover todas as suspensões com foto deixa somente a peça sem foto', async () => {
    await service.restoreProduct('43202');

    const result = await service.listSuspended();

    expect(result.total).toBe(1);
    expect(result.items.map((item: SuspendedProduct) => item.id)).toEqual(['43206']);
  });

  it('retornos de listagem são cópias: array, loja e autor não alteram as fixtures internas', async () => {
    const before = structuredClone(await service.listSuspended());
    const result = await service.listSuspended();
    const item = result.items.find((product: SuspendedProduct) => product.id === '43202')!;
    item.name = 'Nome alterado externamente';
    item.store.name = 'Loja alterada externamente';
    item.moderationReason = 'Motivo alterado externamente';
    item.moderatedBy!.name = 'Autor alterado externamente';
    result.items.length = 0;

    expect(await service.listSuspended()).toEqual(before);
  });

  it('alterar o resultado de suspensão não altera o estado interno', async () => {
    const result = await service.suspendProduct(PRODUCT_ID, REASON);
    result.status = 'vendido';
    result.moderationReason = 'Modificado pelo consumidor';
    result.moderatedAt = '2000-01-01T00:00:00';

    const item = (await service.listSuspended()).items.find(
      (product: SuspendedProduct) => product.id === PRODUCT_ID,
    );

    expect(item).toMatchObject({ status: 'despublicado', moderationReason: REASON });
    expect(item?.moderatedAt).not.toBe('2000-01-01T00:00:00');
  });

  it('reimportar os módulos reinicia o estado em memória sem persistência em sessionStorage', async () => {
    const before = await service.listSuspended();
    await service.suspendProduct(PRODUCT_ID, REASON);
    expect((await service.listSuspended()).total).toBe(3);

    vi.resetModules();
    service = await import('./adminModerationService');

    expect(await service.listSuspended()).toEqual(before);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('flag ausente também escolhe mock, sem enviar HTTP', async () => {
    vi.stubEnv('VITE_USE_MOCKS', undefined);
    vi.resetModules();
    http = await import('./httpClient');
    const calls = stubAdapter(() => new Error('Flag ausente deve usar mock.'));
    service = await import('./adminModerationService');

    expect((await service.listSuspended()).total).toBe(2);
    expect(calls).toHaveLength(0);
  });
});

describe('adminModerationService — contrato TypeScript público', () => {
  it('aceita metadados opcionais, reutiliza Product/Status e tipa as três operações', () => {
    const metadata: ModerationMetadata = {};
    const result: ModerationResult = { productId: PRODUCT_ID, status: 'ativo', ...metadata };
    const product: SuspendedProduct = {
      id: PRODUCT_ID,
      name: 'Peça de teste',
      price: 90,
      coverImageUrl: null,
      store: { id: '43280', name: 'Loja de teste' },
      status: 'despublicado',
      ...metadata,
    };
    const params: ListSuspendedParams = { page: 1, pageSize: 20 };

    expectTypeOf<SuspendedProduct>().toMatchTypeOf<Product>();
    expectTypeOf<SuspendedProduct['status']>().toEqualTypeOf<ProductStatus>();
    expectTypeOf<ReturnType<ModerationService['suspendProduct']>>().toEqualTypeOf<
      Promise<ModerationResult>
    >();
    expectTypeOf<ReturnType<ModerationService['restoreProduct']>>().toEqualTypeOf<
      Promise<ModerationResult>
    >();
    expectTypeOf<ReturnType<ModerationService['listSuspended']>>().toEqualTypeOf<
      Promise<Paginated<SuspendedProduct>>
    >();
    expect(result.moderationReason).toBeUndefined();
    expect(product.moderatedAt).toBeUndefined();
    expect(product.moderatedBy).toBeUndefined();
    expect(params).toEqual({ page: 1, pageSize: 20 });
  });
});
