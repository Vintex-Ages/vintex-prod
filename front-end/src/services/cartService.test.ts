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
});
