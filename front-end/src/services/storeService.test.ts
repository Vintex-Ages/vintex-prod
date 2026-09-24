import { beforeEach, describe, expect, it } from 'vitest';
import {
  createStore,
  getMyStore,
  getStore,
  getStoreProducts,
  requestVerification,
} from './storeService';
import { logout, me, register } from './authService';
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
