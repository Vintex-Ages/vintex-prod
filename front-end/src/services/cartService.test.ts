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
    const cart = await cartService.addItem(USER_ID, '1'); // Nike Camiseta Preto, loja '1'

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
    const cart = await cartService.addItem(USER_ID, '1'); // Nike Camiseta Preto, R$79,90

    expect(cart.groups[0].subtotalCents).toBe(7990);
  });

  it('getCart marca unavailable a peca vendida e exclui do subtotal', async () => {
    await cartService.addItem(USER_ID, '4'); // Zara Vestido Estampado, status "vendido" no mock

    const cart = await cartService.getCart(USER_ID);

    expect(cart.groups[0].items[0].unavailable).toBe(true);
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

describe('cartService (API real) — chave Pix do vendedor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const apiStore = { id: 5, name: 'Brecho Ana', city: 'Porto Alegre' };

  function apiGroup(store: Record<string, unknown>) {
    return {
      store,
      items: [
        {
          product: {
            id: 1,
            name: 'Vestido floral',
            price: 99.9,
            cover_image_url: null,
            store,
          },
          added_at: '2026-09-24T12:00:00Z',
          unavailable: false,
        },
      ],
      subtotal: 99.9,
    };
  }

  // Revisao PR #228, ponto 3 (RN-18/RN-19): a tela de pagamento mostra a chave
  // Pix de cada vendedor, que so existe se vier no grupo do back.
  it('repassa pix_key da loja do grupo para CartGroup.pixKey', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getCart: apiGetCart } = await import('./cartService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: [apiGroup({ ...apiStore, pix_key: 'ana@vintex.com' })],
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const cart = await apiGetCart(USER_ID);

    expect(cart.groups[0].pixKey).toBe('ana@vintex.com');
    expect(cart.groups[0].subtotalCents).toBe(9990);
  });

  it('deixa pixKey undefined quando o back nao envia pix_key', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getCart: apiGetCart } = await import('./cartService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: [apiGroup(apiStore)],
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const cart = await apiGetCart(USER_ID);

    expect(cart.groups[0].pixKey).toBeUndefined();
  });
});
