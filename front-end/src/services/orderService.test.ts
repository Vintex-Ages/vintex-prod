import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryAddress } from '@/types/order';

type OrderServiceModule = typeof import('./orderService');
type CartServiceModule = typeof import('./cartService');
type ProductsModule = typeof import('@/mocks/products');

let orderService: OrderServiceModule;
let cartService: CartServiceModule;
let mockProducts: ProductsModule['products'];

const USER_ID = 'u_ana';

const ADDRESS: DeliveryAddress = {
  cep: '90010-000',
  street: 'Rua dos Andradas',
  number: '500',
  district: 'Centro Histórico',
  city: 'Porto Alegre',
  state: 'RS',
};

describe('orderService (mock)', () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    vi.resetModules();
    orderService = await import('./orderService');
    cartService = await import('./cartService');
    ({ products: mockProducts } = await import('@/mocks/products'));
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  describe('createOrder', () => {
    // Objetivo declarado da issue: garantir o fluxo acordado.
    it('marca as peças como vendidas e as remove do carrinho', async () => {
      await cartService.addItem(USER_ID, '1'); // Jaqueta jeans, loja '1', mesma do Pedido

      const order = await orderService.createOrder(USER_ID, {
        productIds: ['1'],
        deliveryAddress: ADDRESS,
      });

      expect(order.status).toBe('aguardando_comprovante');
      expect(mockProducts.find((product) => product.id === '1')?.status).toBe('vendido');

      const cart = await cartService.getCart(USER_ID);
      expect(cart.groups).toEqual([]);
    });

    it('productAmount soma as peças; totalAmount é igual; platformFee é 9% (RN-11)', async () => {
      const order = await orderService.createOrder(USER_ID, {
        productIds: ['1', '8'], // ambos loja '1': 159.90 + 69.90
        deliveryAddress: ADDRESS,
      });

      expect(order.productAmount).toBe(229.8);
      expect(order.totalAmount).toBe(229.8);
      expect(order.platformFee).toBe(20.68); // 229.80 * 0.09, arredondado
    });

    it('falha com MIXED_STORES sem gravar nada, quando as peças são de lojas diferentes', async () => {
      await expect(
        orderService.createOrder(USER_ID, {
          productIds: ['1', '2'], // lojas '1' e '2'
          deliveryAddress: ADDRESS,
        }),
      ).rejects.toMatchObject({ code: 'MIXED_STORES' });

      // Nenhum Pedido real foi criado: só os de exemplo aparecem na lista.
      const { items } = await orderService.listMyOrders(USER_ID);
      expect(items.every((order) => order.id.startsWith('example-'))).toBe(true);
      expect(mockProducts.find((product) => product.id === '1')?.status).toBe('ativo');
      expect(mockProducts.find((product) => product.id === '2')?.status).toBe('ativo');
    });

    it('falha com PIECE_UNAVAILABLE quando o productId não existe no catálogo', async () => {
      await expect(
        orderService.createOrder(USER_ID, {
          productIds: ['inexistente'],
          deliveryAddress: ADDRESS,
        }),
      ).rejects.toMatchObject({ code: 'PIECE_UNAVAILABLE' });
    });

    it('falha com PIECE_UNAVAILABLE quando a peça já está vendida', async () => {
      await expect(
        orderService.createOrder(USER_ID, {
          productIds: ['4'], // Vestido floral midi, status "vendido" no mock
          deliveryAddress: ADDRESS,
        }),
      ).rejects.toMatchObject({ code: 'PIECE_UNAVAILABLE' });
    });

    it('falha com STORE_WITHOUT_PIX quando a loja não tem chave Pix cadastrada', async () => {
      await expect(
        orderService.createOrder(USER_ID, {
          productIds: ['3'], // Jaqueta biker, loja '3' — sem Pix no mock de propósito
          deliveryAddress: ADDRESS,
        }),
      ).rejects.toMatchObject({ code: 'STORE_WITHOUT_PIX' });
    });

    it('falha com EMPTY_ORDER quando a lista de peças está vazia', async () => {
      await expect(
        orderService.createOrder(USER_ID, { productIds: [], deliveryAddress: ADDRESS }),
      ).rejects.toMatchObject({ code: 'EMPTY_ORDER' });
    });
  });

  describe('submitReceipt', () => {
    // Objetivo declarado: VS-022, "o pedido fica em análise".
    it('leva o Pedido a em_analise e grava o nome do arquivo', async () => {
      const order = await orderService.createOrder(USER_ID, {
        productIds: ['1'],
        deliveryAddress: ADDRESS,
      });
      const file = new File(['conteúdo'], 'comprovante.png', { type: 'image/png' });

      const updated = await orderService.submitReceipt(USER_ID, order.id, file);

      expect(updated.status).toBe('em_analise');
      expect(updated.payment?.status).toBe('pendente');
      expect(updated.payment?.receiptName).toBe('comprovante.png');
      expect(updated.history.map((entry) => entry.status)).toEqual([
        'aguardando_comprovante',
        'em_analise',
      ]);
    });

    it('rejeita com ORDER_NOT_FOUND para um pedido inexistente', async () => {
      const file = new File(['x'], 'comprovante.png', { type: 'image/png' });
      await expect(orderService.submitReceipt(USER_ID, 'inexistente', file)).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
      });
    });
  });

  describe('approveReceipt / rejectReceipt (mock-only, pra #312)', () => {
    it('approveReceipt rejeita com ORDER_NOT_FOUND para um pedido inexistente', async () => {
      await expect(orderService.approveReceipt(USER_ID, 'inexistente')).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
      });
    });

    it('rejectReceipt rejeita com ORDER_NOT_FOUND para um pedido inexistente', async () => {
      await expect(
        orderService.rejectReceipt(USER_ID, 'inexistente', 'motivo qualquer'),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    });

    it('approveReceipt funciona mesmo sem comprovante enviado antes (payment ainda null)', async () => {
      const order = await orderService.createOrder(USER_ID, {
        productIds: ['1'],
        deliveryAddress: ADDRESS,
      });
      expect(order.payment).toBeNull();

      const approved = await orderService.approveReceipt(USER_ID, order.id);

      expect(approved.status).toBe('confirmado');
      expect(approved.payment).toEqual({ status: 'aprovado' });
    });

    it('rejectReceipt funciona mesmo sem comprovante enviado antes (payment ainda null)', async () => {
      const order = await orderService.createOrder(USER_ID, {
        productIds: ['1'],
        deliveryAddress: ADDRESS,
      });

      const rejected = await orderService.rejectReceipt(USER_ID, order.id, 'Sem comprovante.');

      expect(rejected.payment).toEqual({
        status: 'rejeitado',
        rejectionReason: 'Sem comprovante.',
      });
    });

    it('approveReceipt leva a confirmado e aprova o pagamento', async () => {
      const order = await orderService.createOrder(USER_ID, {
        productIds: ['1'],
        deliveryAddress: ADDRESS,
      });
      const file = new File(['x'], 'comprovante.png', { type: 'image/png' });
      await orderService.submitReceipt(USER_ID, order.id, file);

      const approved = await orderService.approveReceipt(USER_ID, order.id);

      expect(approved.status).toBe('confirmado');
      expect(approved.payment?.status).toBe('aprovado');
    });

    // Objetivo declarado: RN-23 ("devolve o pedido ao comprador com motivo").
    it('rejectReceipt volta a aguardando_comprovante (não cria status novo) e grava o motivo', async () => {
      const order = await orderService.createOrder(USER_ID, {
        productIds: ['1'],
        deliveryAddress: ADDRESS,
      });
      const file = new File(['x'], 'comprovante.png', { type: 'image/png' });
      await orderService.submitReceipt(USER_ID, order.id, file);

      const rejected = await orderService.rejectReceipt(USER_ID, order.id, 'Comprovante ilegível.');

      expect(rejected.status).toBe('aguardando_comprovante');
      expect(rejected.payment?.status).toBe('rejeitado');
      expect(rejected.payment?.rejectionReason).toBe('Comprovante ilegível.');
    });
  });

  describe('listMyOrders / getOrder', () => {
    it('lista inclui os pedidos de exemplo (um por status + um rejeitado), mesmo sem nenhum pedido real', async () => {
      const { items, total } = await orderService.listMyOrders(USER_ID);

      const statuses = items.map((order) => order.status);
      expect(statuses).toContain('aguardando_comprovante');
      expect(statuses).toContain('em_analise');
      expect(statuses).toContain('confirmado');
      expect(statuses).toContain('preparando');
      expect(statuses).toContain('enviado');
      expect(statuses).toContain('concluido');
      expect(items.some((order) => order.payment?.status === 'rejeitado')).toBe(true);
      expect(total).toBeGreaterThanOrEqual(7);
    });

    it('pedido real criado aparece primeiro na lista, antes dos exemplos', async () => {
      const order = await orderService.createOrder(USER_ID, {
        productIds: ['1'],
        deliveryAddress: ADDRESS,
      });

      const { items } = await orderService.listMyOrders(USER_ID);

      expect(items[0].id).toBe(order.id);
    });

    it('getOrder encontra tanto um pedido real quanto um de exemplo', async () => {
      const order = await orderService.createOrder(USER_ID, {
        productIds: ['1'],
        deliveryAddress: ADDRESS,
      });

      const real = await orderService.getOrder(USER_ID, order.id);
      expect(real.id).toBe(order.id);

      const example = await orderService.getOrder(USER_ID, 'example-concluido');
      expect(example.status).toBe('concluido');
    });

    it('getOrder rejeita com ORDER_NOT_FOUND para um id desconhecido', async () => {
      await expect(orderService.getOrder(USER_ID, 'inexistente')).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
      });
    });

    it('pedidos são isolados por usuário', async () => {
      await orderService.createOrder(USER_ID, { productIds: ['1'], deliveryAddress: ADDRESS });

      const { items } = await orderService.listMyOrders('u_bia');

      expect(items.some((order) => !order.id.startsWith('example-'))).toBe(false);
    });
  });

  describe('getDeliveryAddressDefault', () => {
    it('sem pedido nenhum, devolve null', async () => {
      const address = await orderService.getDeliveryAddressDefault(USER_ID);
      expect(address).toBeNull();
    });

    it('com um pedido anterior, devolve o endereço desse pedido', async () => {
      await orderService.createOrder(USER_ID, { productIds: ['1'], deliveryAddress: ADDRESS });

      const address = await orderService.getDeliveryAddressDefault(USER_ID);

      expect(address).toEqual(ADDRESS);
    });
  });
});

describe('orderService (API real) — contrato proposto pelo front', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Fixture de rejeição de comprovante no formato do contrato PROPOSTO
   * (back ainda não tem o endpoint — ver doc do arquivo). `price`/
   * `product_amount`/`platform_fee`/`total_amount` vêm como STRING
   * (`Decimal` serializado "cru"), o outro cenário abaixo testa número —
   * critério de aceite: o mapeador aceita os dois.
   */
  const REJECTED_ORDER_RESPONSE = {
    id: 77,
    store: { id: 3, name: 'Roupa Rodada', pix_key: null },
    items: [{ product_id: 3, name: 'Jaqueta biker preta', price: '229.90', cover_image_url: null }],
    product_amount: '229.90',
    platform_fee: '20.69',
    total_amount: '229.90',
    status: 'aguardando_comprovante',
    history: [
      { status: 'aguardando_comprovante', at: '2026-09-20T12:00:00Z' },
      { status: 'em_analise', at: '2026-09-21T09:00:00Z' },
      { status: 'aguardando_comprovante', at: '2026-09-22T08:00:00Z' },
    ],
    delivery_address: {
      cep: '90010-000',
      street: 'Rua dos Andradas',
      number: '500',
      district: 'Centro Histórico',
      city: 'Porto Alegre',
      state: 'RS',
    },
    payment: {
      status: 'rejeitado',
      receipt_name: 'comprovante-ilegivel.jpg',
      submitted_at: '2026-09-21T09:00:00Z',
      rejection_reason: 'Comprovante ilegível — reenvie uma foto nítida do Pix.',
    },
    created_at: '2026-09-20T12:00:00Z',
  };

  // Objetivo declarado: RN-23 — rejeição lida de payment.status, com o motivo mapeado.
  it('mapeia rejectionReason e mantém status em aguardando_comprovante (fixture do contrato proposto)', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getOrder: apiGetOrder } = await import('./orderService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: REJECTED_ORDER_RESPONSE,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const order = await apiGetOrder('u_ana', '77');

    expect(order.status).toBe('aguardando_comprovante');
    expect(order.payment?.status).toBe('rejeitado');
    expect(order.payment?.rejectionReason).toBe(
      'Comprovante ilegível — reenvie uma foto nítida do Pix.',
    );
    // price como string: o mapeador converteu pra number.
    expect(order.productAmount).toBe(229.9);
    expect(order.platformFee).toBe(20.69);
    expect(order.items[0].price).toBe(229.9);
  });

  it('aceita dinheiro como número (outro formato de Decimal serializado)', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getOrder: apiGetOrder } = await import('./orderService');

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({
        data: { ...REJECTED_ORDER_RESPONSE, product_amount: 229.9, platform_fee: 20.69 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });

    const order = await apiGetOrder('u_ana', '77');

    expect(order.productAmount).toBe(229.9);
    expect(order.platformFee).toBe(20.69);
  });

  // Critério de aceite: o mapeador é testado com o envelope Page real.
  it('listMyOrders lê data.items do envelope Page[OrderSummaryResponse]', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { listMyOrders: apiListMyOrders } = await import('./orderService');

    const envelope = {
      items: [
        {
          id: 10,
          store: { id: 1, name: 'Brechó Mercado Público', pix_key: 'loja@vintex.com' },
          items: [{ product_id: 1, name: 'Jaqueta jeans', price: 159.9, cover_image_url: null }],
          total_amount: 159.9,
          status: 'confirmado',
          payment: { status: 'aprovado' },
          created_at: '2026-09-20T12:00:00Z',
        },
      ],
      page: 1,
      page_size: 20,
      total: 1,
    };

    httpClient.defaults.adapter = (config) =>
      Promise.resolve({ data: envelope, status: 200, statusText: 'OK', headers: {}, config });

    const page = await apiListMyOrders('u_ana');

    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(20);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe('10');
    expect(page.items[0].store.pixKey).toBe('loja@vintex.com');
    expect(page.items[0].totalAmount).toBe(159.9);
  });

  it('createOrder envia product_ids e delivery_address no corpo, em snake_case', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { createOrder: apiCreateOrder } = await import('./orderService');

    const calls: unknown[] = [];
    httpClient.defaults.adapter = (config) => {
      calls.push({ url: config.url, data: JSON.parse(config.data as string) });
      return Promise.resolve({
        data: { ...REJECTED_ORDER_RESPONSE, status: 'aguardando_comprovante', payment: null },
        status: 201,
        statusText: 'Created',
        headers: {},
        config,
      });
    };

    await apiCreateOrder('u_ana', { productIds: ['3'], deliveryAddress: ADDRESS });

    expect(calls).toEqual([
      {
        url: '/users/me/orders',
        data: { product_ids: ['3'], delivery_address: ADDRESS },
      },
    ]);
  });

  it('submitReceipt envia multipart/form-data com o arquivo', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { submitReceipt: apiSubmitReceipt } = await import('./orderService');

    let capturedConfig: { url?: string; headers?: unknown; data?: unknown } | undefined;
    httpClient.defaults.adapter = (config) => {
      capturedConfig = { url: config.url, headers: config.headers, data: config.data };
      return Promise.resolve({
        data: { ...REJECTED_ORDER_RESPONSE, status: 'em_analise', payment: { status: 'pendente' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    const file = new File(['x'], 'comprovante.png', { type: 'image/png' });
    const order = await apiSubmitReceipt('u_ana', '77', file);

    expect(capturedConfig?.url).toBe('/users/me/orders/77/receipt');
    expect(capturedConfig?.data).toBeInstanceOf(FormData);
    expect(order.status).toBe('em_analise');
  });

  it('erro sem envelope conhecido (ex.: rede fora) vira OrderError INTERNAL_ERROR', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { getOrder: apiGetOrder } = await import('./orderService');

    httpClient.defaults.adapter = () => Promise.reject(new Error('Network Error'));

    await expect(apiGetOrder('u_ana', '77')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('listMyOrders propaga erro do back como OrderError', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { listMyOrders: apiListMyOrders } = await import('./orderService');

    httpClient.defaults.adapter = () =>
      Promise.reject({ response: { data: { error: { code: 'INTERNAL_ERROR' } } } });

    await expect(apiListMyOrders('u_ana')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('submitReceipt propaga erro do back como OrderError', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { submitReceipt: apiSubmitReceipt } = await import('./orderService');

    httpClient.defaults.adapter = () =>
      Promise.reject({ response: { data: { error: { code: 'ORDER_NOT_FOUND' } } } });

    const file = new File(['x'], 'comprovante.png', { type: 'image/png' });
    await expect(apiSubmitReceipt('u_ana', '77', file)).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
    });
  });

  it('getDeliveryAddressDefault no modo API devolve null (sem contrato confirmado ainda)', async () => {
    const { getDeliveryAddressDefault: apiGetDeliveryAddressDefault } =
      await import('./orderService');

    const address = await apiGetDeliveryAddressDefault('u_ana');

    expect(address).toBeNull();
  });

  it('MIXED_STORES do back (envelope de erro) vira OrderError com o mesmo code', async () => {
    const { httpClient } = await import('@/services/httpClient');
    const { createOrder: apiCreateOrder } = await import('./orderService');

    httpClient.defaults.adapter = () =>
      Promise.reject({
        response: {
          data: { error: { code: 'MIXED_STORES', message: 'Peças de lojas diferentes.' } },
        },
      });

    await expect(
      apiCreateOrder('u_ana', { productIds: ['1', '2'], deliveryAddress: ADDRESS }),
    ).rejects.toMatchObject({ code: 'MIXED_STORES' });
  });
});
