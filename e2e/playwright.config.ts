import { defineConfig, devices } from '@playwright/test';

/**
 * E2E do Vintex: sobe API (uvicorn) e front (Vite) de verdade.
 *
 * Os diretórios são configuráveis porque a suíte vive na raiz do monorepo,
 * mas também roda a partir de um checkout só do front — `E2E_BACKEND_DIR` e
 * `E2E_FRONTEND_DIR` apontam para as pastas correspondentes.
 */
const BACKEND_DIR = process.env.E2E_BACKEND_DIR ?? '../back-end';
const FRONTEND_DIR = process.env.E2E_FRONTEND_DIR ?? '../front-end';

const API_PORT = Number(process.env.E2E_API_PORT ?? 8000);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);

const API_URL = process.env.E2E_API_URL ?? `http://127.0.0.1:${API_PORT}`;
const WEB_URL = process.env.E2E_WEB_URL ?? `http://127.0.0.1:${WEB_PORT}`;

const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:5433/vintex';

const MEDIA_BUCKET = process.env.E2E_MEDIA_BUCKET ?? 'vintex-local-media';
const S3_ENDPOINT_URL = process.env.E2E_S3_ENDPOINT_URL ?? 'http://127.0.0.1:9001';

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  globalSetup: './fixtures/global-setup.ts',

  timeout: 60_000,
  expect: { timeout: 10_000 },

  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },

  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // O app é mobile-first e o público real abre no iPhone: o smoke roda em
      // WebKit no viewport de 393 px. As jornadas completas ficam só no
      // desktop para não duplicar custo e flake.
      name: 'mobile-webkit',
      use: { ...devices['iPhone 14'] },
      testMatch: /smoke\.spec\.ts/,
    },
  ],

  webServer: [
    {
      command:
        process.env.E2E_API_COMMAND ??
        `.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: BACKEND_DIR,
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL,
        APP_ENV: 'development',
        APP_DEBUG: 'true',
        CORS_ORIGINS: '*',
        JWT_SECRET: 'e2e-only-change-me',
        // Determinístico: nenhuma chamada real de IA na suíte.
        AI_PROVIDER: 'fake',
        AI_WORKER_PROVIDER: 'unavailable',
        // Upload de fotos e comprovantes precisa de bucket (senão 503).
        MEDIA_BUCKET,
        S3_ENDPOINT_URL,
        AWS_ACCESS_KEY_ID: 'test',
        AWS_SECRET_ACCESS_KEY: 'test',
        AWS_REGION: 'us-east-2',
        // Cota alta: uma execução completa faz várias perguntas.
        CHAT_QUOTA_PER_PERSON: '100',
        CHAT_QUOTA_PER_DAY: '1000',
      },
    },
    {
      command:
        'corepack pnpm exec vite --host 127.0.0.1 --port ' + WEB_PORT + ' --strictPort',
      cwd: FRONTEND_DIR,
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        // Mock ligado por padrão no front: E2E contra mock não prova nada.
        VITE_USE_MOCKS: 'false',
        VITE_API_BASE_URL: `${API_URL}/api`,
      },
    },
  ],
});
