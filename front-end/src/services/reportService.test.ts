import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderReportError } from './reportService';

type ReportModule = typeof import('./reportService');

let reports: ReportModule;

/** Semeia um Pedido no mesmo armazenamento que o `orderService` usa (`orders:${userId}`). */
function seedOrder(userId: string, id: string, status = 'confirmado') {
  const key = `orders:${userId}`;
  const current = JSON.parse(window.sessionStorage.getItem(key) ?? '[]') as unknown[];
  current.push({ id, status, store: { id: 's_1', name: 'Brechó Mercado Público' } });
  window.sessionStorage.setItem(key, JSON.stringify(current));
}

/** Roda a promessa e devolve o erro tipado que ela lançou. */
async function failure(promise: Promise<unknown>): Promise<OrderReportError> {
  try {
    await promise;
  } catch (error) {
    return error as OrderReportError;
  }
  throw new Error('A chamada deveria ter falhado.');
}

describe('reportService (mock)', () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    vi.resetModules();
    reports = await import('./reportService');
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  describe('reportOrder', () => {
    it('envia a Reclamação e devolve no formato do 201', async () => {
      seedOrder('u_ana', '10');

      const report = await reports.reportOrder('10', 'danificado', '  A manga veio rasgada.  ');

      expect(report).toEqual({
        id: expect.any(String),
        orderId: '10',
        reason: 'danificado',
        description: 'A manga veio rasgada.',
        createdAt: expect.any(String),
      });
      expect(Object.keys(report).sort()).toEqual([
        'createdAt',
        'description',
        'id',
        'orderId',
        'reason',
      ]);
    });

    it('aceita os dois motivos', async () => {
      seedOrder('u_ana', '10');

      await expect(
        reports.reportOrder('10', 'nao_recebido', 'Nunca chegou.'),
      ).resolves.toMatchObject({ reason: 'nao_recebido' });
      await expect(
        reports.reportOrder('10', 'danificado', 'Chegou rasgada.'),
      ).resolves.toMatchObject({ reason: 'danificado' });
    });

    it('404 quando o Pedido não existe', async () => {
      const error = await failure(reports.reportOrder('999', 'danificado', 'Rasgada.'));

      expect(error).toMatchObject({ name: 'OrderReportError', code: 'ORDER_NOT_FOUND' });
    });

    it('422 com field=description para descrição vazia ou só espaços', async () => {
      seedOrder('u_ana', '10');

      for (const description of ['', '   ']) {
        const error = await failure(reports.reportOrder('10', 'danificado', description));
        expect(error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'description' });
      }
    });

    it('422 com field=reason para motivo fora dos dois valores', async () => {
      seedOrder('u_ana', '10');

      const error = await failure(
        reports.reportOrder('10', 'outro' as unknown as 'danificado', 'Texto.'),
      );

      expect(error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'reason' });
    });

    it('não grava nada quando a validação falha', async () => {
      seedOrder('u_ana', '10');

      await failure(reports.reportOrder('10', 'danificado', ''));

      expect((await reports.listReports()).total).toBe(0);
    });

    // RN-77: só depois da confirmação.
    it('recusa Pedido que ainda não foi confirmado', async () => {
      seedOrder('u_ana', '11', 'aguardando_comprovante');
      seedOrder('u_ana', '12', 'em_analise');

      for (const id of ['11', '12']) {
        const error = await failure(reports.reportOrder(id, 'nao_recebido', 'Nada.'));
        expect(error.code).toBe('ORDER_NOT_REPORTABLE');
      }
    });
  });

  describe('listReports', () => {
    it('lista vazia no início', async () => {
      expect(await reports.listReports()).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
    });

    it('devolve comprador e loja, com a mais recente primeiro', async () => {
      seedOrder('u_ana', '10');
      seedOrder('u_bia', '20');
      await reports.reportOrder('10', 'danificado', 'Primeira.');
      await new Promise((resolve) => setTimeout(resolve, 5));
      await reports.reportOrder('20', 'nao_recebido', 'Segunda.');

      const { items, total } = await reports.listReports();

      expect(total).toBe(2);
      expect(items.map((item) => item.description)).toEqual(['Segunda.', 'Primeira.']);
      expect(items[0]).toMatchObject({
        orderId: '20',
        reason: 'nao_recebido',
        buyer: { id: 'u_bia' },
        store: { id: 's_1', name: 'Brechó Mercado Público' },
      });
    });

    it('pagina por page e pageSize', async () => {
      seedOrder('u_ana', '10');
      for (let i = 1; i <= 5; i += 1) {
        await reports.reportOrder('10', 'danificado', `Reclamação ${i}`);
        await new Promise((resolve) => setTimeout(resolve, 2));
      }

      const first = await reports.listReports({ page: 1, pageSize: 2 });
      const last = await reports.listReports({ page: 3, pageSize: 2 });
      const beyond = await reports.listReports({ page: 4, pageSize: 2 });

      expect(first).toMatchObject({ page: 1, pageSize: 2, total: 5 });
      expect(first.items.map((item) => item.description)).toEqual(['Reclamação 5', 'Reclamação 4']);
      expect(last.items.map((item) => item.description)).toEqual(['Reclamação 1']);
      expect(beyond.items).toEqual([]);
    });
  });
});

describe('reportService (API real) — contrato proposto pelo front (back-end#268)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCKS', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const API_REPORT = {
    id: 5,
    order_id: 10,
    reason: 'danificado',
    description: 'A manga veio rasgada.',
    created_at: '2026-10-29T12:00:00Z',
  };

  interface Call {
    url?: string;
    method?: string;
    data?: unknown;
    params?: unknown;
  }

  /** Troca o adaptador do `httpClient`: `respond` devolve o corpo ou um erro com `response`. */
  async function stubAdapter(respond: (config: Call) => unknown) {
    const { httpClient } = await import('@/services/httpClient');
    const calls: Call[] = [];
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

  function httpError(status: number, error?: Record<string, unknown>) {
    return Object.assign(new Error(`HTTP ${status}`), {
      response: { status, data: error ? { error } : {} },
    });
  }

  it('reportOrder chama POST /users/me/orders/{id}/reports e converte o 201', async () => {
    const calls = await stubAdapter(() => API_REPORT);
    const { reportOrder } = await import('./reportService');

    const report = await reportOrder('10', 'danificado', '  A manga veio rasgada. ');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: '/users/me/orders/10/reports', method: 'post' });
    expect(JSON.parse(calls[0].data as string)).toEqual({
      reason: 'danificado',
      description: 'A manga veio rasgada.',
    });
    expect(report).toEqual({
      id: '5',
      orderId: '10',
      reason: 'danificado',
      description: 'A manga veio rasgada.',
      createdAt: '2026-10-29T12:00:00Z',
    });
  });

  it('valida antes de chamar a API: descrição vazia não gera requisição', async () => {
    const calls = await stubAdapter(() => API_REPORT);
    const { reportOrder } = await import('./reportService');

    const error = await failure(reportOrder('10', 'danificado', '  '));

    expect(error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'description' });
    expect(calls).toHaveLength(0);
  });

  it('404 vira ORDER_NOT_FOUND', async () => {
    await stubAdapter(() => httpError(404));
    const { reportOrder } = await import('./reportService');

    const error = await failure(reportOrder('77', 'danificado', 'Rasgada.'));

    expect(error).toMatchObject({ name: 'OrderReportError', code: 'ORDER_NOT_FOUND' });
  });

  it('422 volta com o campo, de error.fields', async () => {
    await stubAdapter(() =>
      httpError(422, {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos.',
        fields: { description: 'Descreva o problema com mais detalhes.' },
      }),
    );
    const { reportOrder } = await import('./reportService');

    const error = await failure(reportOrder('10', 'danificado', 'x'));

    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'description',
      message: 'Descreva o problema com mais detalhes.',
    });
  });

  it('422 volta com o campo, de error.field', async () => {
    await stubAdapter(() => httpError(422, { code: 'VALIDATION_ERROR', field: 'reason' }));
    const { reportOrder } = await import('./reportService');

    const error = await failure(reportOrder('10', 'danificado', 'x'));

    expect(error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'reason' });
  });

  it('repassa o código e a mensagem do back quando o Pedido não permite reportar', async () => {
    await stubAdapter(() =>
      httpError(409, { code: 'ORDER_NOT_REPORTABLE', message: 'Pedido ainda não confirmado.' }),
    );
    const { reportOrder } = await import('./reportService');

    const error = await failure(reportOrder('10', 'nao_recebido', 'Nada.'));

    expect(error).toMatchObject({
      code: 'ORDER_NOT_REPORTABLE',
      message: 'Pedido ainda não confirmado.',
    });
  });

  it('listReports chama GET /admin/reports paginado e converte o envelope', async () => {
    const calls = await stubAdapter(() => ({
      items: [
        {
          ...API_REPORT,
          buyer: { id: 3, name: 'Ana' },
          store: { id: 9, name: 'Roupa Rodada' },
        },
      ],
      page: 2,
      page_size: 5,
      total: 11,
    }));
    const { listReports } = await import('./reportService');

    const page = await listReports({ page: 2, pageSize: 5 });

    expect(calls[0]).toMatchObject({
      url: '/admin/reports',
      method: 'get',
      params: { page: 2, page_size: 5 },
    });
    expect(page).toMatchObject({ page: 2, pageSize: 5, total: 11 });
    expect(page.items[0]).toEqual({
      id: '5',
      orderId: '10',
      reason: 'danificado',
      description: 'A manga veio rasgada.',
      createdAt: '2026-10-29T12:00:00Z',
      buyer: { id: '3', name: 'Ana' },
      store: { id: '9', name: 'Roupa Rodada' },
    });
  });

  it('403 na rota da administradora vira FORBIDDEN', async () => {
    await stubAdapter(() => httpError(403));
    const { listReports } = await import('./reportService');

    const error = await failure(listReports());

    expect(error).toMatchObject({ name: 'OrderReportError', code: 'FORBIDDEN' });
  });
});
