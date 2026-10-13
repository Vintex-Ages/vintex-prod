import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryAddress } from '@/types/order';

type AdminModule = typeof import('./adminReceiptService');
type OrderServiceModule = typeof import('./orderService');

let admin: AdminModule;
let orderService: OrderServiceModule;

const BUYER_ID = 'u_ana';

const ADDRESS: DeliveryAddress = {
  cep: '90010-000',
  street: 'Rua dos Andradas',
  number: '500',
  district: 'Centro Histórico',
  city: 'Porto Alegre',
  state: 'RS',
};

/** Cria um Pedido real e envia o comprovante, deixando-o pendente na fila. */
async function submittedOrder(userId = BUYER_ID, productId = '1', fileName = 'comprovante.png') {
  const order = await orderService.createOrder(userId, {
    productIds: [productId],
    deliveryAddress: ADDRESS,
  });
  await orderService.submitReceipt(userId, order.id, new File(['x'], fileName));
  return order;
}

describe('adminReceiptService (mock)', () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    vi.resetModules();
    orderService = await import('./orderService');
    admin = await import('./adminReceiptService');
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  describe('listReceipts', () => {
    it('lista só Pedidos com comprovante enviado, de qualquer comprador', async () => {
      const first = await submittedOrder('u_ana', '1');
      const second = await submittedOrder('u_bia', '2');
      await orderService.createOrder('u_caio', { productIds: ['8'], deliveryAddress: ADDRESS }); // sem comprovante

      const { items, total } = await admin.listReceipts();

      expect(total).toBe(2);
      expect(items.map((review) => review.orderId).sort()).toEqual([first.id, second.id].sort());
    });

    // Objetivo declarado: fila.
    it('status=pendente só devolve pendentes', async () => {
      const pending = await submittedOrder('u_ana', '1');
      const toApprove = await submittedOrder('u_bia', '2');
      await admin.approveReceipt(toApprove.id);

      const { items } = await admin.listReceipts({ status: 'pendente' });

      expect(items.map((review) => review.orderId)).toEqual([pending.id]);
      expect(items.every((review) => review.payment.status === 'pendente')).toBe(true);
    });

    it('busca q casa por nome da peça, loja ou comprador', async () => {
      await submittedOrder('u_ana', '1');
      await submittedOrder('u_bia', '2');

      expect((await admin.listReceipts({ q: 'u_bia' })).items).toHaveLength(1);
      expect((await admin.listReceipts({ q: 'inexistente' })).items).toHaveLength(0);
    });

    it('monta comissão de 9% e líquido do vendedor em reais', async () => {
      await submittedOrder(BUYER_ID, '1'); // R$159,90

      const [review] = (await admin.listReceipts()).items;

      expect(review.totalAmount).toBe(159.9);
      expect(review.platformFee).toBe(14.39);
      expect(review.sellerNetAmount).toBe(145.51);
      expect(review.payment.receiptUrl).toBe(`/api/admin/payments/${review.orderId}/receipt`);
      expect(review.payment.receiptType).toBe('image');
    });

    it('receiptType é pdf para arquivo .pdf', async () => {
      await submittedOrder(BUYER_ID, '1', 'comprovante.pdf');

      const [review] = (await admin.listReceipts()).items;

      expect(review.payment.receiptType).toBe('pdf');
    });

    it('sem arquivo nem data de envio: receiptType é image e submittedAt cai no createdAt', async () => {
      const order = await orderService.createOrder(BUYER_ID, {
        productIds: ['1'],
        deliveryAddress: ADDRESS,
      });
      // Gera `payment: { status: 'aprovado' }`, sem receiptName nem submittedAt.
      await orderService.approveReceipt(BUYER_ID, order.id);

      const [review] = (await admin.listReceipts()).items;

      expect(review.payment.receiptType).toBe('image');
      expect(review.payment.submittedAt).toBe(order.createdAt);
    });

    it('page fora do intervalo devolve lista vazia, mantendo o total', async () => {
      await submittedOrder();

      const result = await admin.listReceipts({ page: 2 });

      expect(result).toMatchObject({ items: [], page: 2, pageSize: 20, total: 1 });
    });
  });

  describe('approveReceipt', () => {
    // Objetivo declarado: "aprovar avança o pedido".
    it('leva o Pedido do comprador a confirmado e preenche validatedBy/validatedAt', async () => {
      const order = await submittedOrder();

      const review = await admin.approveReceipt(order.id);

      expect(review.payment.status).toBe('aprovado');
      expect(review.payment.validatedBy).toEqual({ id: 'u_admin', name: 'Admin Vintex' });
      expect(review.payment.validatedAt).toEqual(expect.any(String));

      const seenByBuyer = await orderService.getOrder(BUYER_ID, order.id);
      expect(seenByBuyer.status).toBe('confirmado');
    });

    it('ORDER_NOT_FOUND para Pedido inexistente', async () => {
      await expect(admin.approveReceipt('inexistente')).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
      });
    });

    it('ORDER_NOT_FOUND para Pedido sem comprovante enviado', async () => {
      const order = await orderService.createOrder(BUYER_ID, {
        productIds: ['1'],
        deliveryAddress: ADDRESS,
      });

      await expect(admin.approveReceipt(order.id)).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
      });
    });
  });

  describe('rejectReceipt', () => {
    // Objetivo declarado: RN-23.
    it('grava o motivo e o Pedido volta a aguardando_comprovante', async () => {
      const order = await submittedOrder();

      const review = await admin.rejectReceipt(order.id, '  Comprovante ilegível.  ');

      expect(review.payment.status).toBe('rejeitado');
      expect(review.payment.rejectionReason).toBe('Comprovante ilegível.');
      expect(review.payment.validatedBy).toEqual({ id: 'u_admin', name: 'Admin Vintex' });
      expect(review.payment.validatedAt).toEqual(expect.any(String));

      const seenByBuyer = await orderService.getOrder(BUYER_ID, order.id);
      expect(seenByBuyer.status).toBe('aguardando_comprovante');
      expect(seenByBuyer.payment?.rejectionReason).toBe('Comprovante ilegível.');
    });

    it('sem motivo falha com REASON_REQUIRED e não altera o Pedido', async () => {
      const order = await submittedOrder();

      await expect(admin.rejectReceipt(order.id, '   ')).rejects.toMatchObject({
        code: 'REASON_REQUIRED',
      });

      const seenByBuyer = await orderService.getOrder(BUYER_ID, order.id);
      expect(seenByBuyer.status).toBe('em_analise');
    });

    it('ORDER_NOT_FOUND para Pedido inexistente', async () => {
      await expect(admin.rejectReceipt('inexistente', 'motivo')).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
      });
    });
  });
});

describe('adminReceiptService (API real) — contrato proposto pelo front', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** `Decimal` serializado como string; a lista usa o envelope Page real. */
  const API_REVIEW = {
    order_id: 77,
    buyer: { name: 'Ana', email: 'ana@exemplo.com', phone: null },
    store: { id: 3, name: 'Roupa Rodada', seller_name: 'Bia', pix_key: 'loja@vintex.com' },
    items: [{ product_id: 3, name: 'Jaqueta biker preta', price: '229.90', cover_image_url: null }],
    total_amount: '229.90',
    platform_fee: '20.69',
    seller_net_amount: '209.21',
    payment: {
      status: 'pendente',
      receipt_type: 'pdf',
      submitted_at: '2026-09-21T09:00:00Z',
      validated_by: null,
      validated_at: null,
      rejection_reason: null,
    },
  };

  async function stubAdapter(
    respond: (config: {
      url?: string;
      method?: string;
      data?: unknown;
      params?: unknown;
    }) => unknown,
  ) {
    const { httpClient } = await import('@/services/httpClient');
    const calls: { url?: string; method?: string; data?: unknown; params?: unknown }[] = [];
    httpClient.defaults.adapter = (config) => {
      calls.push({
        url: config.url,
        method: config.method,
        data: config.data,
        params: config.params,
      });
      const result = respond(config);
      return result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve({ data: result, status: 200, statusText: 'OK', headers: {}, config });
    };
    return calls;
  }

  it('listReceipts lê data.items do envelope Page e converte dinheiro string → número', async () => {
    const calls = await stubAdapter(() => ({
      items: [API_REVIEW],
      page: 1,
      page_size: 20,
      total: 1,
    }));
    const { listReceipts } = await import('./adminReceiptService');

    const page = await listReceipts({ status: 'pendente', q: 'ana' });

    expect(calls[0]).toMatchObject({
      url: '/admin/payments',
      params: { status: 'pendente', q: 'ana' },
    });
    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    const [review] = page.items;
    expect(review.orderId).toBe('77');
    expect(review.store).toEqual({
      id: '3',
      name: 'Roupa Rodada',
      sellerName: 'Bia',
      pixKey: 'loja@vintex.com',
    });
    expect(review.totalAmount).toBe(229.9);
    expect(review.platformFee).toBe(20.69);
    expect(review.sellerNetAmount).toBe(209.21);
    expect(review.items[0].price).toBe(229.9);
    expect(review.payment.receiptType).toBe('pdf');
    expect(review.payment.receiptUrl).toBe('/api/admin/payments/77/receipt');
    expect(review.payment.validatedBy).toBeUndefined();
  });

  it('aceita dinheiro como número', async () => {
    await stubAdapter(() => ({
      items: [
        { ...API_REVIEW, total_amount: 229.9, platform_fee: 20.69, seller_net_amount: 209.21 },
      ],
      page: 1,
      page_size: 20,
      total: 1,
    }));
    const { listReceipts } = await import('./adminReceiptService');

    const [review] = (await listReceipts()).items;

    expect(review.totalAmount).toBe(229.9);
    expect(review.sellerNetAmount).toBe(209.21);
  });

  it('approveReceipt faz POST em /approve e mapeia validatedBy/validatedAt', async () => {
    const calls = await stubAdapter(() => ({
      ...API_REVIEW,
      payment: {
        ...API_REVIEW.payment,
        status: 'aprovado',
        validated_by: { id: 1, name: 'Admin' },
        validated_at: '2026-10-07T12:00:00Z',
      },
    }));
    const { approveReceipt } = await import('./adminReceiptService');

    const review = await approveReceipt('77');

    expect(calls[0]).toMatchObject({ method: 'post', url: '/admin/payments/77/approve' });
    expect(review.payment.validatedBy).toEqual({ id: '1', name: 'Admin' });
    expect(review.payment.validatedAt).toBe('2026-10-07T12:00:00Z');
  });

  it('rejectReceipt envia { reason } no corpo', async () => {
    const calls = await stubAdapter(() => ({
      ...API_REVIEW,
      payment: { ...API_REVIEW.payment, status: 'rejeitado', rejection_reason: 'Ilegível.' },
    }));
    const { rejectReceipt } = await import('./adminReceiptService');

    const review = await rejectReceipt('77', 'Ilegível.');

    expect(calls[0]).toMatchObject({ method: 'post', url: '/admin/payments/77/reject' });
    expect(JSON.parse(calls[0].data as string)).toEqual({ reason: 'Ilegível.' });
    expect(review.payment.rejectionReason).toBe('Ilegível.');
  });

  // Critério de aceite: sem motivo, falha antes de chamar a API.
  it('rejectReceipt sem motivo falha com REASON_REQUIRED sem chamar a API', async () => {
    const calls = await stubAdapter(() => API_REVIEW);
    const { rejectReceipt } = await import('./adminReceiptService');

    await expect(rejectReceipt('77', '  ')).rejects.toMatchObject({ code: 'REASON_REQUIRED' });

    expect(calls).toHaveLength(0);
  });

  // Critério de aceite: 403 vira FORBIDDEN.
  it('403 vira AdminReceiptError FORBIDDEN em lista, aprovar e rejeitar', async () => {
    const forbidden = () =>
      Promise.reject({
        response: { status: 403, data: { error: { code: 'SOMETHING', message: 'Proibido.' } } },
      });
    const { httpClient } = await import('@/services/httpClient');
    httpClient.defaults.adapter = forbidden;
    const { listReceipts, approveReceipt, rejectReceipt } = await import('./adminReceiptService');

    await expect(listReceipts()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(approveReceipt('77')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(rejectReceipt('77', 'motivo')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('propaga o code do envelope de erro do back', async () => {
    const { httpClient } = await import('@/services/httpClient');
    httpClient.defaults.adapter = () =>
      Promise.reject({
        response: {
          status: 404,
          data: { error: { code: 'ORDER_NOT_FOUND', message: 'Não achei.' } },
        },
      });
    const { approveReceipt } = await import('./adminReceiptService');

    await expect(approveReceipt('77')).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  it('403 sem corpo vira FORBIDDEN com a mensagem padrão', async () => {
    const { httpClient } = await import('@/services/httpClient');
    httpClient.defaults.adapter = () => Promise.reject({ response: { status: 403 } });
    const { listReceipts } = await import('./adminReceiptService');

    await expect(listReceipts()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Você não tem permissão para esta ação.',
    });
  });

  it('code do back sem message usa a mensagem padrão', async () => {
    const { httpClient } = await import('@/services/httpClient');
    httpClient.defaults.adapter = () =>
      Promise.reject({ response: { status: 404, data: { error: { code: 'ORDER_NOT_FOUND' } } } });
    const { approveReceipt } = await import('./adminReceiptService');

    await expect(approveReceipt('77')).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
      message: 'Erro ao validar comprovante.',
    });
  });

  it('mapeia os campos opcionais quando o back os envia', async () => {
    await stubAdapter(() => ({
      items: [
        {
          ...API_REVIEW,
          buyer: { ...API_REVIEW.buyer, phone: '51999990000' },
          store: { ...API_REVIEW.store, seller_name: undefined },
          payment: { ...API_REVIEW.payment, receipt_url: '/api/admin/payments/77/receipt?v=2' },
        },
      ],
      page: 1,
      page_size: 20,
      total: 1,
    }));
    const { listReceipts } = await import('./adminReceiptService');

    const [review] = (await listReceipts()).items;

    expect(review.buyer.phone).toBe('51999990000');
    expect(review.store.sellerName).toBeUndefined();
    expect(review.payment.receiptUrl).toBe('/api/admin/payments/77/receipt?v=2');
  });

  it('erro sem envelope (rede fora) vira INTERNAL_ERROR', async () => {
    const { httpClient } = await import('@/services/httpClient');
    httpClient.defaults.adapter = () => Promise.reject(new Error('Network Error'));
    const { listReceipts } = await import('./adminReceiptService');

    await expect(listReceipts()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
