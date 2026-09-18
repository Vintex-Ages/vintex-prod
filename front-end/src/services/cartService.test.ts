import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

type CartServiceModule = typeof import('./cartService');
type AuthServiceModule = typeof import('./authService');

let cartService: CartServiceModule;
let authService: AuthServiceModule;

describe('cartService (mock)', () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    vi.resetModules();
    authService = await import('./authService');
    cartService = await import('./cartService');
    await authService.register({ name: 'Ana', email: 'ana@exemplo.com', password: 'senha123' });
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('getCart: comeca vazio, sem grupos', async () => {
    const cart = await cartService.getCart();

    expect(cart.groups).toEqual([]);
  });

  it('addItem: adiciona a peca, agrupada pela loja dela', async () => {
    const cart = await cartService.addItem('1'); // Nike Camiseta Preto, loja '1'

    expect(cart.groups).toHaveLength(1);
    expect(cart.groups[0].store.id).toBe('1');
    expect(cart.groups[0].items).toHaveLength(1);
    expect(cart.groups[0].items[0].product.id).toBe('1');
    expect(cart.groups[0].items[0].unavailable).toBeFalsy();
  });

  it('RN-46: addItem duas vezes da mesma peca e no-op', async () => {
    await cartService.addItem('1');
    const cart = await cartService.addItem('1');

    expect(cart.groups).toHaveLength(1);
    expect(cart.groups[0].items).toHaveLength(1);
  });

  it('addItem de pecas de lojas diferentes cria grupos separados', async () => {
    await cartService.addItem('1'); // loja '1'
    const cart = await cartService.addItem('2'); // loja '2'

    expect(cart.groups).toHaveLength(2);
  });

  it('addItem de duas pecas da mesma loja fica no mesmo grupo', async () => {
    await cartService.addItem('1'); // loja '1'
    const cart = await cartService.addItem('8'); // tambem loja '1'

    expect(cart.groups).toHaveLength(1);
    expect(cart.groups[0].items).toHaveLength(2);
  });

  it('subtotalCents soma os itens disponiveis do grupo, em centavos', async () => {
    const cart = await cartService.addItem('1'); // Nike Camiseta Preto, R$79,90

    expect(cart.groups[0].subtotalCents).toBe(7990);
  });

  it('getCart marca unavailable a peca vendida e exclui do subtotal', async () => {
    await cartService.addItem('4'); // Zara Vestido Estampado, status "vendido" no mock

    const cart = await cartService.getCart();

    expect(cart.groups[0].items[0].unavailable).toBe(true);
    expect(cart.groups[0].subtotalCents).toBe(0);
  });

  it('removeItem remove a peca do carrinho', async () => {
    await cartService.addItem('1');
    const cart = await cartService.removeItem('1');

    expect(cart.groups).toEqual([]);
  });

  it('carrinho e isolado por usuario do mock', async () => {
    await cartService.addItem('1');

    await authService.logout();
    await authService.register({ name: 'Bia', email: 'bia@exemplo.com', password: 'senha123' });

    const cart = await cartService.getCart();

    expect(cart.groups).toEqual([]);
  });
});
