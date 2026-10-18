import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

type CartServiceModule = typeof import('./cartService');

let cartService: CartServiceModule;

const USER_ID = 'u_ana';

describe('cartService (mock)', () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    vi.resetModules();
    cartService = await import('./cartService');
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('getCart: comeca vazio, sem grupos', async () => {
    const cart = await cartService.getCart(USER_ID);

    expect(cart.groups).toEqual([]);
  });

  it('addItem: adiciona a peca, agrupada pela loja dela', async () => {
    const cart = await cartService.addItem(USER_ID, '1'); // Jaqueta jeans, loja '1'

    expect(cart.groups).toHaveLength(1);
    expect(cart.groups[0].store.id).toBe('1');
    expect(cart.groups[0].items).toHaveLength(1);
    expect(cart.groups[0].items[0].product.id).toBe('1');
    expect(cart.groups[0].items[0].unavailable).toBeFalsy();
  });

  it('RN-46: addItem duas vezes da mesma peca e no-op', async () => {
    await cartService.addItem(USER_ID, '1');
    const cart = await cartService.addItem(USER_ID, '1');

    expect(cart.groups).toHaveLength(1);
    expect(cart.groups[0].items).toHaveLength(1);
  });

  it('addItem de pecas de lojas diferentes cria grupos separados', async () => {
    await cartService.addItem(USER_ID, '1'); // loja '1'
    const cart = await cartService.addItem(USER_ID, '2'); // loja '2'

    expect(cart.groups).toHaveLength(2);
  });

  it('addItem de duas pecas da mesma loja fica no mesmo grupo', async () => {
    await cartService.addItem(USER_ID, '1'); // loja '1'
    const cart = await cartService.addItem(USER_ID, '8'); // tambem loja '1'

    expect(cart.groups).toHaveLength(1);
    expect(cart.groups[0].items).toHaveLength(2);
  });

  it('subtotalCents soma os itens disponiveis do grupo, em centavos', async () => {
    const cart = await cartService.addItem(USER_ID, '1'); // Jaqueta jeans, R$159,90

    expect(cart.groups[0].subtotalCents).toBe(15990);
  });

  it('getCart marca unavailable a peca vendida e exclui do subtotal', async () => {
    await cartService.addItem(USER_ID, '4'); // Vestido floral midi, status "vendido" no mock

    const cart = await cartService.getCart(USER_ID);

    expect(cart.groups[0].items[0].unavailable).toBe('vendido');
    expect(cart.groups[0].subtotalCents).toBe(0);
  });

  it('removeItem remove a peca do carrinho', async () => {
    await cartService.addItem(USER_ID, '1');
    const cart = await cartService.removeItem(USER_ID, '1');

    expect(cart.groups).toEqual([]);
  });

  it('carrinho e isolado por usuario do mock', async () => {
    await cartService.addItem(USER_ID, '1');

    const cart = await cartService.getCart('u_bia');

    expect(cart.groups).toEqual([]);
  });

  it('reload (F5): carrinho continua carregando so com o userId, sem login previo no mock de auth', async () => {
    await cartService.addItem(USER_ID, '1');

    // Simula o F5: modulos recarregados (mock de auth em memoria zerado),
    // sessionStorage mantido. Nenhum login/register e feito de novo.
    vi.resetModules();
    const reloadedCartService = await import('./cartService');

    const cart = await reloadedCartService.getCart(USER_ID);

    expect(cart.groups).toHaveLength(1);
    expect(cart.groups[0].items[0].product.id).toBe('1');
  });

  // Revisao PR #228, ponto 3: o mock de produtos nao guarda chave Pix de loja
  // nenhuma, entao o grupo sai sem pixKey em vez de um valor inventado.
  it('grupo do mock nao tem pixKey (mock de produtos nao guarda chave Pix)', async () => {
    const cart = await cartService.addItem(USER_ID, '1');

    expect(cart.groups[0].pixKey).toBeUndefined();
  });
});

describe('#359 — cartService: contrato do PR backend #279', () => {
  let client: (typeof import('./httpClient'))['httpClient'];
  let originalAdapter: typeof client.defaults.adapter;
  const calls: string[] = [];

  // Fixture local do contrato proposto; não é uma resposta de backend integrado.
  const apiGroups = [
    {
      store: {
        id: 11,
        name: 'Brechó Aurora',
        verified: true,
        pix_key: 'aurora@pix.test',
        city: 'Porto Alegre',
        logo_url: 'https://cdn.test/aurora.png',
      },
      items: [
        {
          product_id: 101,
          name: 'Jaqueta jeans',
          price: 89.9,
          cover_image_url: 'https://cdn.test/jaqueta.png',
          status: 'ativo',
          available: true,
        },
        {
          product_id: 102,
          name: 'Saia pausada',
          price: 30,
          cover_image_url: null,
          status: 'despublicado',
          available: false,
        },
      ],
      subtotal: 89.9,
    },
    {
      store: {
        id: 22,
        name: 'Brechó Brisa',
        verified: false,
        pix_key: 'brisa@pix.test',
        city: 'Pelotas',
        logo_url: 'https://cdn.test/brisa.png',
      },
      items: [
        {
          product_id: 201,
          name: 'Bota de couro',
          price: 149.5,
          cover_image_url: null,
          status: 'ativo',
          available: true,
        },
      ],
      subtotal: 149.5,
    },
  ];

  function respondWith(groups: unknown[] = apiGroups) {
    client.defaults.adapter = async (config) => {
      calls.push(`${config.method} ${config.url}`);
      return {
        data: { items: groups, page: 1, page_size: 20, total: groups.length },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    client = (await import('./httpClient')).httpClient;
    originalAdapter = client.defaults.adapter;
    cartService = await import('./cartService');
    calls.length = 0;
    respondWith();
  });

  afterEach(() => {
    client.defaults.adapter = originalAdapter;
    vi.unstubAllEnvs();
  });

  it('mapeia a chave Pix de cada grupo para pixKey', async () => {
    const cart = await cartService.getCart(USER_ID);

    expect(cart.groups.map((entry) => entry.pixKey)).toEqual(['aurora@pix.test', 'brisa@pix.test']);
  });

  it('mapeia city da loja de cada grupo', async () => {
    const cart = await cartService.getCart(USER_ID);

    expect(cart.groups.map((entry) => entry.store.city)).toEqual(['Porto Alegre', 'Pelotas']);
  });

  it('mapeia logo_url para logoUrl da loja de cada grupo', async () => {
    const cart = await cartService.getCart(USER_ID);

    expect(cart.groups.map((entry) => entry.store.logoUrl)).toEqual([
      'https://cdn.test/aurora.png',
      'https://cdn.test/brisa.png',
    ]);
  });

  it('mantém a associação entre loja, Pix, cidade, logo e suas peças', async () => {
    const cart = await cartService.getCart(USER_ID);

    for (const [index, source] of apiGroups.entries()) {
      expect(cart.groups[index]).toMatchObject({
        store: {
          id: String(source.store.id),
          name: source.store.name,
          city: source.store.city,
          logoUrl: source.store.logo_url,
        },
        pixKey: source.store.pix_key,
        items: source.items.map((product) => ({
          product: { id: String(product.product_id), store: { id: String(source.store.id) } },
        })),
      });
    }
  });

  it('preserva identificação, selo, peças, preços, disponibilidade e subtotal do backend', async () => {
    const cart = await cartService.getCart(USER_ID);

    expect(cart.groups).toHaveLength(2);
    for (const [index, source] of apiGroups.entries()) {
      const actual = cart.groups[index];
      expect(actual.store).toMatchObject({
        id: String(source.store.id),
        name: source.store.name,
        verified: source.store.verified,
      });
      expect(actual.subtotalCents).toBe(Math.round(source.subtotal * 100));
      expect(actual.items).toHaveLength(source.items.length);
      for (const [itemIndex, product] of source.items.entries()) {
        expect(actual.items[itemIndex].product).toMatchObject({
          id: String(product.product_id),
          name: product.name,
          price: product.price,
          coverImageUrl: product.cover_image_url,
        });
      }
    }
    expect(cart.groups[0].items[0].unavailable).toBeUndefined();
    expect(cart.groups[0].items[1].unavailable).toBe('pausado');
  });

  it('aceita pix_key null sem inventar chave ou descartar a loja', async () => {
    respondWith([{ ...apiGroups[0], store: { ...apiGroups[0].store, pix_key: null } }]);

    const cart = await cartService.getCart(USER_ID);

    expect(cart.groups).toHaveLength(1);
    expect(cart.groups[0].pixKey).toBeUndefined();
    expect(cart.groups[0].items).toHaveLength(2);
  });

  it('aceita city e logo_url null sem inventar dados', async () => {
    respondWith([
      { ...apiGroups[0], store: { ...apiGroups[0].store, city: null, logo_url: null } },
    ]);

    const cart = await cartService.getCart(USER_ID);

    expect(cart.groups[0].store.city).toBeUndefined();
    expect(cart.groups[0].store.logoUrl).toBeUndefined();
    expect(cart.groups[0].pixKey).toBe('aurora@pix.test');
  });

  it('aceita fixture antiga sem os três campos novos', async () => {
    respondWith([{ ...apiGroups[0], store: { id: 11, name: 'Brechó Aurora', verified: true } }]);

    const cart = await cartService.getCart(USER_ID);

    expect(cart.groups[0].store).toMatchObject({ id: '11', name: 'Brechó Aurora', verified: true });
    expect(cart.groups[0].pixKey).toBeUndefined();
    expect(cart.groups[0].store.city).toBeUndefined();
    expect(cart.groups[0].store.logoUrl).toBeUndefined();
    expect(cart.groups[0].subtotalCents).toBe(8990);
  });

  it.each(['GET', 'POST', 'DELETE'] as const)(
    'preserva todos os metadados no carrinho retornado por %s',
    async (operation) => {
      const cart =
        operation === 'GET'
          ? await cartService.getCart(USER_ID)
          : operation === 'POST'
            ? await cartService.addItem(USER_ID, '101')
            : await cartService.removeItem(USER_ID, '102');

      expect(calls).toEqual([
        operation === 'GET'
          ? 'get /users/me/cart'
          : operation === 'POST'
            ? 'post /users/me/cart/items'
            : 'delete /users/me/cart/items/102',
      ]);
      expect(cart.groups[0]).toMatchObject({
        pixKey: 'aurora@pix.test',
        store: { city: 'Porto Alegre', logoUrl: 'https://cdn.test/aurora.png' },
      });
      expect(cart.groups[1]).toMatchObject({
        pixKey: 'brisa@pix.test',
        store: { city: 'Pelotas', logoUrl: 'https://cdn.test/brisa.png' },
      });
    },
  );
});

describe('cartService (API real) — chave Pix do vendedor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const apiStore = { id: 5, name: 'Brecho Ana', verified: true };

  /** Grupo no formato de `CartStoreResponse` (`app/schemas/cart_schema.py`). */
  function apiGroup(store: Record<string, unknown>, available = true, status?: string) {
    return {
      store,
      items: [
        {
          product_id: 1,
          name: 'Vestido floral',
          price: 99.9,
          cover_image_url: null,
          status: status ?? (available ? 'ativo' : 'vendido'),
          available,
        },
      ],
      subtotal: available ? 99.9 : 0,
    };
  }

  /** Envelope `Page[CartStoreResponse]` que as três rotas devolvem. */
  function page(groups: unknown[]) {
    return { items: groups, page: 1, page_size: 20, total: groups.length };
  }

  function respondWith(data: unknown, calls: string[] = []) {
    return async () => {
      const { httpClient } = await import('@/services/httpClient');
      httpClient.defaults.adapter = (config) => {
        calls.push(`${config.method} ${config.url}`);
        return Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });
      };
    };
  }

  // #226: as três rotas devolvem o envelope paginado, não um array cru.
  it('as três chamadas leem os grupos de data.items do envelope paginado', async () => {
    const calls: string[] = [];
    await respondWith(page([apiGroup(apiStore)]), calls)();
    const { getCart, addItem, removeItem } = await import('./cartService');

    for (const cart of [
      await getCart(USER_ID),
      await addItem(USER_ID, '1'),
      await removeItem(USER_ID, '1'),
    ]) {
      expect(cart.groups).toHaveLength(1);
      expect(cart.groups[0].store).toEqual({ id: '5', name: 'Brecho Ana', verified: true });
      expect(cart.groups[0].items[0].product).toMatchObject({
        id: '1',
        name: 'Vestido floral',
        price: 99.9,
        store: { id: '5' },
      });
      expect(cart.groups[0].subtotalCents).toBe(9990);
    }
    expect(calls).toEqual([
      'get /users/me/cart',
      'post /users/me/cart/items',
      'delete /users/me/cart/items/1',
    ]);
  });

  // #226: `available: false` do back tem de chegar indisponível.
  it('peça vendida (available: false) chega indisponível por venda', async () => {
    await respondWith(page([apiGroup(apiStore, false)]))();
    const { getCart } = await import('./cartService');

    const cart = await getCart(USER_ID);

    expect(cart.groups[0].items[0].unavailable).toBe('vendido');
    expect(cart.groups[0].subtotalCents).toBe(0);
  });

  // #297: o back também marca `available: false` a peça despublicada.
  it('peça despublicada chega indisponível por pausa, não por venda', async () => {
    await respondWith(page([apiGroup(apiStore, false, 'despublicado')]))();
    const { getCart } = await import('./cartService');

    const cart = await getCart(USER_ID);

    expect(cart.groups[0].items[0].unavailable).toBe('pausado');
  });

  it('peça disponível chega sem motivo de indisponibilidade', async () => {
    await respondWith(page([apiGroup(apiStore)]))();
    const { getCart } = await import('./cartService');

    const cart = await getCart(USER_ID);

    expect(cart.groups[0].items[0].unavailable).toBeUndefined();
  });

  // Revisao PR #228, ponto 3 (RN-18/RN-19): a tela de pagamento mostra a chave
  // Pix de cada vendedor, que so existe se vier no grupo do back.
  it('repassa pix_key da loja do grupo para CartGroup.pixKey', async () => {
    await respondWith(page([apiGroup({ ...apiStore, pix_key: 'ana@vintex.com' })]))();
    const { getCart } = await import('./cartService');

    const cart = await getCart(USER_ID);

    expect(cart.groups[0].pixKey).toBe('ana@vintex.com');
  });

  it('deixa pixKey undefined quando o back nao envia pix_key', async () => {
    await respondWith(page([apiGroup(apiStore)]))();
    const { getCart } = await import('./cartService');

    const cart = await getCart(USER_ID);

    expect(cart.groups[0].pixKey).toBeUndefined();
  });
});
