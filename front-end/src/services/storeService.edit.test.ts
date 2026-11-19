import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, getMyStoreDetails, getStore, updateMyStore } from './storeService';
import { logout, register } from './authService';
import type { StoreInput } from '@/types/store';

/**
 * Edição da própria loja (FE-US006-4, #335): `PATCH /api/users/me/store` do
 * back-end#221. O envio é parcial: campo ausente não é apagado.
 */

const input: StoreInput = {
  name: 'Brechó da Ceci',
  description: 'Peças vintage selecionadas a dedo.',
  document: { type: 'cpf', number: '00000000000' },
  address: {
    cep: '90000000',
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

async function registerNewUser(): Promise<void> {
  userSeq += 1;
  await register({ name: 'Lojista', email: `edita${userSeq}@vintex.com`, password: 'senha123' });
}

describe('edição da própria loja (mock)', () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    await logout();
    await registerNewUser();
  });

  it('sem loja, getMyStoreDetails devolve null e updateMyStore falha com STORE_NOT_FOUND', async () => {
    expect(await getMyStoreDetails()).toBeNull();
    await expect(updateMyStore({ name: 'Outro nome' })).rejects.toMatchObject({
      code: 'STORE_NOT_FOUND',
    });
  });

  it('getMyStoreDetails traz documento, endereço e chave Pix do cadastro', async () => {
    await createStore(input);

    expect(await getMyStoreDetails()).toEqual(
      expect.objectContaining({
        name: 'Brechó da Ceci',
        description: 'Peças vintage selecionadas a dedo.',
        logoUrl: null,
        pixKey: 'ceci@vintex.com',
        document: { type: 'cpf', number: '00000000000' },
        address: input.address,
      }),
    );
  });

  it('alterar só a logo não apaga descrição, endereço nem chave Pix', async () => {
    await createStore(input);

    const atualizada = await updateMyStore({
      logo: new File(['logo'], 'logo.png', { type: 'image/png' }),
    });

    expect(atualizada.logoUrl).toBeTruthy();
    expect(atualizada).toMatchObject({
      description: 'Peças vintage selecionadas a dedo.',
      pixKey: 'ceci@vintex.com',
      address: input.address,
    });
    expect(await getMyStoreDetails()).toEqual(atualizada);
  });

  it('alterar o endereço muda também a cidade do perfil público', async () => {
    const loja = await createStore(input);
    const novo = { ...input.address, cep: '96010000', city: 'Pelotas', district: 'Porto' };

    const atualizada = await updateMyStore({ address: novo });

    expect(atualizada.address).toEqual(novo);
    expect(atualizada.name).toBe('Brechó da Ceci');
    expect((await getStore(loja.id)).city).toBe('Pelotas');
  });

  it('envio vazio não muda nada', async () => {
    await createStore(input);
    const antes = await getMyStoreDetails();

    expect(await updateMyStore({})).toEqual(antes);
  });
});

describe('edição da própria loja (API real)', () => {
  /** `StoreResponse` de `GET /api/users/me/store`, o mesmo que o `PATCH` devolve. */
  const MINHA_LOJA = {
    id: 7,
    seller_id: 3,
    name: 'Brechó Aurora',
    description: null,
    logo_url: null,
    pix_key: 'aurora@pix.test',
    verified: true,
    document_type: 'CNPJ',
    document_value: '12345678000199',
    terms_version: '1.0',
    terms_accepted_at: '2026-03-14T12:00:00Z',
    address: {
      street: 'Rua Ali',
      number: '120',
      complement: null,
      neighborhood: 'Centro',
      city: 'Porto Alegre',
      state: 'RS',
      zip_code: '90010000',
    },
  };

  type Chamada = { method?: string; url?: string; data?: unknown };

  async function api(responder: (chamada: Chamada) => { status: number; data?: unknown }) {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    const { httpClient } = await import('@/services/httpClient');
    const chamadas: Chamada[] = [];
    httpClient.defaults.adapter = (config) => {
      const chamada = {
        method: config.method,
        url: config.url,
        data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
      };
      chamadas.push(chamada);
      const { status, data } = responder(chamada);
      const response = { data, status, statusText: '', headers: {}, config };
      return status >= 400
        ? Promise.reject(Object.assign(new Error(`HTTP ${status}`), { response, config }))
        : Promise.resolve(response);
    };
    return { service: await import('./storeService'), chamadas };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getMyStoreDetails traduz documento, endereço e chave Pix da rota privada', async () => {
    const { service } = await api(() => ({ status: 200, data: MINHA_LOJA }));

    expect(await service.getMyStoreDetails()).toEqual({
      id: '7',
      name: 'Brechó Aurora',
      description: '',
      logoUrl: null,
      pixKey: 'aurora@pix.test',
      document: { type: 'cnpj', number: '12345678000199' },
      address: {
        cep: '90010000',
        street: 'Rua Ali',
        number: '120',
        complement: undefined,
        district: 'Centro',
        city: 'Porto Alegre',
        state: 'RS',
      },
    });
  });

  it('getMyStoreDetails devolve null quando a rota responde 404', async () => {
    const { service } = await api(() => ({ status: 404 }));

    expect(await service.getMyStoreDetails()).toBeNull();
  });

  it('updateMyStore manda só os campos alterados, com os nomes do back', async () => {
    const { service, chamadas } = await api(() => ({ status: 200, data: MINHA_LOJA }));

    await service.updateMyStore({
      pixKey: ' nova@pix.test ',
      address: {
        cep: '96010-000',
        street: 'Rua Nova',
        number: '5',
        district: 'Porto',
        city: 'Pelotas',
        state: 'RS',
      },
    });

    expect(chamadas).toEqual([
      {
        method: 'patch',
        url: '/users/me/store',
        data: {
          pix_key: 'nova@pix.test',
          address: {
            street: 'Rua Nova',
            number: '5',
            complement: null,
            neighborhood: 'Porto',
            city: 'Pelotas',
            state: 'RS',
            zip_code: '96010000',
          },
        },
      },
    ]);
  });

  it('logo nova sobe a mídia antes e vai como logo_url', async () => {
    const { service, chamadas } = await api(({ url }) =>
      url === '/users/me/media'
        ? { status: 201, data: { items: [{ key: 'k', url: 'https://cdn.test/logo.png' }] } }
        : { status: 200, data: MINHA_LOJA },
    );

    await service.updateMyStore({ logo: new File(['x'], 'logo.png', { type: 'image/png' }) });

    expect(chamadas.map(({ method, url }) => `${method} ${url}`)).toEqual([
      'post /users/me/media',
      'patch /users/me/store',
    ]);
    expect(chamadas[1].data).toEqual({ logo_url: 'https://cdn.test/logo.png' });
  });

  it('tirar a logo manda logo_url nulo', async () => {
    const { service, chamadas } = await api(() => ({ status: 200, data: MINHA_LOJA }));

    await service.updateMyStore({ logo: null });

    expect(chamadas[0].data).toEqual({ logo_url: null });
  });

  it('PATCH 404 (sem loja) vira STORE_NOT_FOUND', async () => {
    const { service } = await api(() => ({ status: 404 }));

    await expect(service.updateMyStore({ name: 'X' })).rejects.toMatchObject({
      code: 'STORE_NOT_FOUND',
    });
  });
});
