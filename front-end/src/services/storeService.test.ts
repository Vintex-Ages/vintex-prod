import { beforeEach, describe, expect, it } from 'vitest';
import {
  createStore,
  getMyStore,
  getStore,
  getStoreProducts,
  requestVerification,
} from './storeService';
import type { StoreInput } from '@/types/store';

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

describe('storeService', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
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

  it('requestVerification muda verification de pendente para confiavel', async () => {
    await createStore(input);

    const verified = await requestVerification();

    expect(verified.verification).toBe('confiavel');
    expect((await getMyStore())?.verification).toBe('confiavel');
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
});
