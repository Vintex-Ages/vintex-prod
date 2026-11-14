import { request } from '@playwright/test';
import { API_URL } from './api';

/**
 * Falha cedo, com instrução acionável, quando o ambiente não está pronto.
 * Roda uma vez por execução, antes de qualquer spec.
 */
export default async function globalSetup(): Promise<void> {
  const api = await request.newContext();

  try {
    const health = await api.get(`${API_URL.replace(/\/api$/, '')}/health`, {
      timeout: 10_000,
    }).catch(() => null);

    if (!health?.ok()) {
      throw new Error(
        `API não respondeu em ${API_URL}/health.\n` +
          'Suba o banco e a API antes do E2E:\n' +
          '  docker compose -f back-end/docker-compose.yml up -d db\n' +
          '  cd back-end && alembic upgrade head\n' +
          '  python -m app.seeds.lojas && python -m app.seeds.pecas && python -m app.seeds.admin',
      );
    }

    const feed = await api.get(`${API_URL}/products?page_size=1`);
    if (!feed.ok()) {
      throw new Error(`GET /products respondeu ${feed.status()}. Confira migrations e seeds.`);
    }
    const body = (await feed.json()) as { total: number };
    if (body.total === 0) {
      throw new Error('Catálogo vazio: rode os seeds antes do E2E (python -m app.seeds.pecas).');
    }

    const terms = await api.get(`${API_URL}/legal/terms`);
    if (!terms.ok()) {
      throw new Error('Termos de uso ausentes: rode python -m app.seeds.legal.');
    }
  } finally {
    await api.dispose();
  }
}
