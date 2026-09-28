import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStore,
  getMyStore,
  getStore,
  getStoreProducts,
  requestVerification,
} from './storeService';
import { logout, me, register } from './authService';
import type { StoreInput, StoreProfile } from '@/types/store';

const input: StoreInput = {
  name: 'Brechó da Ceci',
  description: 'Peças vintage selecionadas a dedo.',
  document: { type: 'cpf', number: '00000000000' },
  address: {
    cep: '90000-000',
    street: 'Rua das Flores',
    number: '123',
    district: 'Centro',
    city: 'Porto Alegre',
    state: 'RS',
  },
  pixKey: 'ceci@vintex.com',
};

/** O mock de auth vive em memória entre os testes: cada cadastro precisa de e-mail novo. */
let userSeq = 0;

async function registerNewUser(name: string): Promise<void> {
  userSeq += 1;
  await register({ name, email: `loja${userSeq}@vintex.com`, password: 'senha123' });
}

describe('storeService', () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    await logout();
    await registerNewUser('Vendedora');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sem loja criada, getMyStore devolve null', async () => {
    expect(await getMyStore()).toBeNull();
  });

  it('createStore cria a loja e getMyStore passa a devolvê-la', async () => {
    const created = await createStore(input);

    expect(created).toMatchObject({
      name: input.name,
      description: input.description,
      city: input.address.city,
      state: input.address.state,
      verification: 'pendente',
    });
    expect(typeof created.id).toBe('string');
    expect(created.id.length).toBeGreaterThan(0);

    expect(await getMyStore()).toEqual(created);
  });

  it('createStore marca a conta logada como vendedora (me() passa a ter is_seller = true)', async () => {
    // E-mail próprio deste teste: o mock de auth vive em memória e não é
    // reiniciado entre os testes do arquivo.
    await register({ name: 'Ceci', email: 'ceci.loja@vintex.com', password: 'senha123' });
    expect((await me()).is_seller).toBe(false);

    await createStore(input);

    expect((await me()).is_seller).toBe(true);
  });

  it('a loja é do usuário que a criou: outro usuário logado depois não a vê', async () => {
    // Cenário do review do PR #243: A cria a loja, sai, B se cadastra.
    await registerNewUser('Usuária A');
    await createStore(input);
    await logout();
    await registerNewUser('Usuária B');

    expect(await getMyStore()).toBeNull();
  });

  it('getStore é público: a loja criada por A aparece para B e para quem não está logado', async () => {
    await registerNewUser('Usuária A');
    const created = await createStore(input);
    await logout();

    expect(await getStore(created.id)).toEqual(created);

    await registerNewUser('Usuária B');
    expect(await getStore(created.id)).toEqual(created);
  });

  it('requestVerification só grava confiavel depois de ~500ms: antes disso a loja segue pendente', async () => {
    await createStore(input);
    vi.useFakeTimers();

    let verified: StoreProfile | undefined;
    const pending = requestVerification().then((store) => {
      verified = store;
    });

    // Estado intermediário que a tela (FE-US007-1) precisa conseguir exibir.
    await vi.advanceTimersByTimeAsync(499);
    expect(verified).toBeUndefined();
    expect((await getMyStore())?.verification).toBe('pendente');

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(verified?.verification).toBe('confiavel');
    expect((await getMyStore())?.verification).toBe('confiavel');
  });

  it('requestVerification sem loja falha na hora, sem esperar o delay', async () => {
    vi.useFakeTimers();

    await expect(requestVerification()).rejects.toMatchObject({ code: 'STORE_NOT_FOUND' });
  });

  it('getStoreProducts devolve só peças ativas da loja', async () => {
    // Loja '1' tem 2 peças 'ativo' no mock de catálogo (ids 1 e 8).
    const activeStore = await getStoreProducts('1', {});
    expect(activeStore.items.length).toBe(2);
    expect(activeStore.items.every((product) => product.store.id === '1')).toBe(true);

    // Loja '4' só tem uma peça, com status 'vendido' — não deve aparecer.
    const soldOnlyStore = await getStoreProducts('4', {});
    expect(soldOnlyStore.items).toHaveLength(0);
  });

  it('getStore devolve o perfil público de uma loja existente do catálogo mockado', async () => {
    const store = await getStore('1');

    expect(store.id).toBe('1');
    expect(store.name).toBe('Brechó Mercado Público');
    expect(store.verification).toBe('confiavel');
  });

  it('getStore de loja do catálogo traz métricas fictícias, com peças ativas batendo com getStoreProducts', async () => {
    const store = await getStore('1');
    const products = await getStoreProducts('1');

    expect(store.metrics).toMatchObject({
      activeProducts: products.total,
      soldProducts: expect.any(Number),
      monthsOnPlatform: expect.any(Number),
      shippingWithoutComplaintRate: expect.any(Number),
      rating: expect.any(Number),
    });
  });

  it('loja criada no mock já nasce com métricas zeradas (sem avaliação ainda, RN-74)', async () => {
    const created = await createStore(input);

    expect(created.metrics).toEqual({ activeProducts: 0, soldProducts: 0, monthsOnPlatform: 0 });
    expect((await getStore(created.id)).metrics).toEqual(created.metrics);
  });
});

/**
 * Caminho real de `GET /api/stores/{id}` e `/products` (back-end#142).
 *
 * O mapeamento anterior divergia em sete campos e quebrava num oitavo: lia
 * `city`/`state` no topo (vêm dentro de `address`), esperava `verification`
 * (vem `verified: boolean`), procurava `created_at` no topo (está em
 * `metrics`), usava outros nomes para as contagens, e lia `item.store.id` na
 * lista de peças — que a rota não devolve, porque a loja é a mesma da URL.
 * Nenhum teste via, porque só o caminho mock era coberto.
 */
describe('storeService (API real) — loja pública', () => {
  const LOJA = {
    id: 3,
    name: 'Segunda Chance Modas',
    description: 'Brechó de Pelotas.',
    logo_url: null,
    verified: true,
    address: {
      street: 'Rua X',
      number: '10',
      complement: null,
      neighborhood: 'Centro',
      city: 'Pelotas',
      state: 'RS',
      zip_code: '96010-000',
    },
    metrics: {
      created_at: '2026-03-27T00:00:00',
      products_listed: 12,
      products_sold: 4,
    },
  };

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * `/users/me/store` e `/stores/{id}` devolvem formatos diferentes para a
   * mesma entidade. Usar o mapeador público na rota privada derrubava a
   * guarda de vendedor com `TypeError`, porque ele lê `metrics.created_at` e
   * a resposta privada não tem `metrics`.
   */
  it('getMyStore usa o formato da rota privada, que não tem metrics nem address', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getMyStore: apiGetMyStore } = await import('./storeService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: {
          id: 5,
          seller_id: 2,
          name: 'Brechó do Mauro',
          description: null,
          logo_url: null,
          document_type: 'CPF',
          document_value: '529.982.247-25',
          terms_version: 'v1',
          terms_accepted_at: '2026-09-27T23:00:00',
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const loja = await apiGetMyStore();

    expect(loja?.id).toBe('5');
    expect(loja?.name).toBe('Brechó do Mauro');
  });

  it('getMyStore devolve null quando o vendedor ainda não tem loja', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getMyStore: apiGetMyStore } = await import('./storeService');

    httpClient.defaults.adapter = () => Promise.reject({ response: { status: 404, data: {} } });

    await expect(apiGetMyStore()).resolves.toBeNull();
  });

  it('desaninha endereço, traduz o selo e lê a data de dentro de metrics', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getStore: apiGetStore } = await import('./storeService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({ data: LOJA, status: 200, statusText: 'OK', headers: {}, config });

    const loja = await apiGetStore('3');

    expect(loja.city).toBe('Pelotas');
    expect(loja.state).toBe('RS');
    expect(loja.verification).toBe('confiavel');
    expect(loja.createdAt).toBe('2026-03-27T00:00:00');
    expect(loja.metrics?.activeProducts).toBe(12);
    expect(loja.metrics?.soldProducts).toBe(4);
  });

  it('loja sem selo vira pendente, e sem endereço não quebra', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getStore: apiGetStore } = await import('./storeService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: { ...LOJA, verified: false, address: null },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const loja = await apiGetStore('3');

    expect(loja.verification).toBe('pendente');
    expect(loja.city).toBe('');
  });

  it('a lista de peças não lê a loja de dentro do item, que a rota não manda', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getStoreProducts: apiGetStoreProducts } = await import('./storeService');

    httpClient.defaults.adapter = (config) => {
      const data = String(config.url).endsWith('/products')
        ? {
            items: [{ id: 9, name: 'Jaqueta', price: 120, cover_image_url: null, status: 'ativo' }],
            page: 1,
            page_size: 20,
            total: 1,
          }
        : LOJA;

      return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });
    };

    const pagina = await apiGetStoreProducts('3', {});

    expect(pagina.items[0]).toEqual({
      id: '9',
      name: 'Jaqueta',
      price: 120,
      coverImageUrl: null,
      store: { id: '3', name: 'Segunda Chance Modas', city: 'Pelotas' },
    });
  });
});

/**
 * Fixtures serializados dos models do back em `develop@659951f`, com
 * `model_dump_json()` — não escritos à mão. A rodada anterior de correção
 * deste arquivo usou fixture inventado, e por isso o teste passava enquanto
 * o contrato real estava quebrado.
 */
describe('storeService (API real) — rotas privadas de escrita', () => {
  /** `POST` e `GET /api/users/me/store` devolvem os dois `StoreResponse`. */
  const STORE_RESPONSE = {
    id: 7,
    seller_id: 3,
    name: 'Brechó Aurora',
    description: 'Peças garimpadas',
    logo_url: 'http://localhost:8000/api/media/logos/aurora.png',
    document_type: 'CNPJ',
    document_value: '12345678000199',
    terms_version: '1.0',
    terms_accepted_at: '2026-03-14T12:00:00Z',
  };

  /** `GET /api/stores/{id}/products` — `price` é `Decimal` sem serializer no back. */
  const STORE_PRODUCTS_PAGE = {
    items: [
      { id: 41, name: 'Jaqueta de couro', price: '199.90', cover_image_url: null, status: 'ativo' },
    ],
    page: 1,
    page_size: 20,
    total: 1,
  };

  const PERFIL_PUBLICO = {
    id: 7,
    name: 'Brechó Aurora',
    description: 'Peças garimpadas',
    logo_url: null,
    verified: true,
    address: {
      street: 'Rua Ali',
      number: '120',
      complement: null,
      neighborhood: 'Centro',
      city: 'Porto Alegre',
      state: 'RS',
      zip_code: '90010000',
    },
    metrics: { created_at: '2026-03-14T12:00:00Z', products_listed: 12, products_sold: 5 },
  };

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function responder(dados: unknown, status = 200) {
    return (config: unknown) =>
      Promise.resolve({
        data: dados,
        status,
        statusText: 'OK',
        headers: {},
        config,
      }) as never;
  }

  /**
   * `POST /api/users/me/store` devolve `StoreResponse`, igual ao `GET` da
   * mesma rota — não o formato público. Usar o mapeador público aqui estoura
   * em `metrics.created_at`, e é o clique de "Criar loja" do `front-end#270`.
   */
  it('createStore lê o formato da rota privada, sem metrics nem address', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { createStore: apiCreateStore } = await import('./storeService');

    httpClient.defaults.adapter = responder(STORE_RESPONSE, 201);

    const loja = await apiCreateStore(input);

    expect(loja.id).toBe('7');
    expect(loja.name).toBe('Brechó Aurora');
    expect(loja.description).toBe('Peças garimpadas');
    expect(loja.logoUrl).toBe('http://localhost:8000/api/media/logos/aurora.png');
    expect(loja.verification).toBe('pendente');
    expect(loja.metrics).toBeUndefined();
  });

  /**
   * `StoreProductItemResponse.price` é `Decimal` **sem** `field_serializer`,
   * então chega como string — ao contrário do feed e do detalhe, que têm o
   * serializer e chegam como número.
   */
  it('getStoreProducts converte o price de string para número', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getStoreProducts: apiGetStoreProducts } = await import('./storeService');

    httpClient.defaults.adapter = ((config: { url?: string }) =>
      config.url?.includes('/products')
        ? responder(STORE_PRODUCTS_PAGE)(config)
        : responder(PERFIL_PUBLICO)(config)) as never;

    const pagina = await apiGetStoreProducts('7');

    expect(pagina.items).toHaveLength(1);
    expect(pagina.items[0].price).toBe(199.9);
    expect(typeof pagina.items[0].price).toBe('number');
  });

  /**
   * `POST /api/users/me/store/verification` devolve `{ verified: boolean }`
   * (`SellerVerificationResponse`, no `back-end#195`) — uma terceira forma,
   * que não dá para virar `StoreProfile`. Enquanto a rota não existe na
   * `develop`, falhar com mensagem é melhor que estourar em `metrics`.
   */
  it('requestVerification falha com mensagem, e não com TypeError de metrics', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { requestVerification: apiRequestVerification } = await import('./storeService');

    httpClient.defaults.adapter = responder({ verified: true });

    await expect(apiRequestVerification()).rejects.toThrow(/contrato|indisponível/i);
  });
});
