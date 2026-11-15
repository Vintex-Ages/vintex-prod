import type { APIRequestContext, Page } from '@playwright/test';

/**
 * Helpers de dados e sessão. A regra da suíte: autenticar pela API e injetar
 * a sessão no navegador; login pela UI só no teste dedicado a login.
 */

export const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000/api';
export const WEB_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@vintex.example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'vintex-admin-dev',
};

/** Chaves reais usadas por `context/useAuth.ts` (sessionStorage, não localStorage). */
export const AUTH_KEYS = {
  token: 'vintex.auth.token',
  user: 'vintex.auth.user',
  refreshToken: 'vintex.auth.refreshToken',
} as const;

export type Session = {
  token: string;
  refreshToken: string;
  user: { id: number; name: string; email: string; is_admin: boolean };
};

/** Senha das contas criadas pela suíte — o teste de sessão vencida loga pela UI. */
export const BUYER_PASSWORD = 'Vintex#2026e2e';

async function assertOk(response: Awaited<ReturnType<APIRequestContext['post']>>, label: string) {
  if (!response.ok()) {
    throw new Error(`${label} falhou: ${response.status()} ${await response.text()}`);
  }
}

export async function login(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<Session> {
  const response = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  await assertOk(response, `login ${email}`);
  const body = await response.json();
  return {
    token: body.access_token,
    refreshToken: body.refresh_token,
    user: body.user,
  };
}

export async function termsVersion(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${API_URL}/legal/terms`);
  await assertOk(response, 'GET /legal/terms');
  return (await response.json()).version;
}

export async function registerBuyer(
  request: APIRequestContext,
  overrides: { name?: string; email?: string; password?: string } = {},
): Promise<Session> {
  const email = overrides.email ?? uniqueEmail('comprador');
  const response = await request.post(`${API_URL}/auth/register`, {
    data: {
      name: overrides.name ?? 'Compradora E2E',
      email,
      password: overrides.password ?? BUYER_PASSWORD,
      accepted_terms_version: await termsVersion(request),
    },
  });
  await assertOk(response, `register ${email}`);
  const body = await response.json();
  return { token: body.access_token, refreshToken: body.refresh_token, user: body.user };
}

/** Injeta a sessão antes da primeira navegação (storageState não vê sessionStorage). */
export async function adoptSession(page: Page, session: Session): Promise<void> {
  await page.addInitScript(
    ({ keys, token, refreshToken, user }) => {
      window.sessionStorage.setItem(keys.token, token);
      window.sessionStorage.setItem(keys.user, JSON.stringify(user));
      window.sessionStorage.setItem(keys.refreshToken, refreshToken);
    },
    { keys: AUTH_KEYS, ...session },
  );
}

export function uniqueEmail(prefix: string): string {
  const id = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}+${id}@vintex.example.com`;
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export type FeedProduct = {
  id: number;
  name: string;
  price: number;
  store: { id: number; name: string; verified: boolean };
};

export async function firstAvailableProduct(request: APIRequestContext): Promise<FeedProduct> {
  const response = await request.get(`${API_URL}/products?page_size=1`);
  await assertOk(response, 'GET /products');
  const body = await response.json();
  if (!body.items?.length) {
    throw new Error('Catálogo vazio: rode `python -m app.seeds.pecas` antes do E2E.');
  }
  return body.items[0];
}

export async function productByCategory(
  request: APIRequestContext,
  category: 'Roupas' | 'Sapatos' | 'Acessórios',
): Promise<FeedProduct> {
  const response = await request.get(`${API_URL}/products?page_size=1&category=${category}`);
  await assertOk(response, `GET /products?category=${category}`);
  const body = await response.json();
  if (!body.items?.length) {
    throw new Error(`Nenhuma peça ativa na categoria ${category}.`);
  }
  return body.items[0];
}

/** CNPJ com dígitos verificadores válidos — o cadastro recusa documento inválido. */
export function validCnpj(): string {
  const base = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10));
  const digits = [...base, 0, 0, 0, 1];
  const dv = (numbers: number[]): number => {
    const weights =
      numbers.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = numbers.reduce((acc, value, index) => acc + value * weights[index], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = dv(digits);
  const second = dv([...digits, first]);
  return [...digits, first, second].join('');
}

export type StorePayload = {
  name: string;
  document_type: 'CNPJ';
  document_value: string;
  pix_key: string;
  description?: string;
  address: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
  };
};

export function storePayload(overrides: Partial<StorePayload> = {}): StorePayload {
  return {
    name: overrides.name ?? uniqueName('Brechó E2E'),
    document_type: 'CNPJ',
    document_value: overrides.document_value ?? validCnpj(),
    pix_key: overrides.pix_key ?? `e2e+${Date.now()}@vintex.example.com`,
    description: 'Loja criada pela suíte E2E.',
    address: {
      street: 'Rua da Praia',
      number: '123',
      neighborhood: 'Cidade Baixa',
      city: 'Porto Alegre',
      state: 'RS',
      zip_code: '90035-072',
    },
    ...overrides,
  };
}

export async function createStore(
  request: APIRequestContext,
  session: Session,
  overrides: Partial<StorePayload> = {},
): Promise<{ id: number; name: string }> {
  const response = await request.post(`${API_URL}/users/me/store`, {
    headers: { Authorization: `Bearer ${session.token}` },
    data: storePayload(overrides),
  });
  await assertOk(response, 'POST /users/me/store');
  return response.json();
}

/** PNG 1×1 transparente: suficiente para upload de foto/comprovante. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Endereço de entrega do checkout; o CEP é interceptado no teste. */
export const ADDRESS = {
  cep: '90035-072',
  street: 'Rua da Praia',
  number: '123',
  neighborhood: 'Cidade Baixa',
  city: 'Porto Alegre',
  state: 'RS',
} as const;

export const VIACEP_RESPONSE = {
  cep: '90035-072',
  logradouro: ADDRESS.street,
  bairro: ADDRESS.neighborhood,
  localidade: ADDRESS.city,
  uf: ADDRESS.state,
};

export async function interceptViaCep(page: Page): Promise<void> {
  await page.route('**/viacep.com.br/**', (route) => route.fulfill({ json: VIACEP_RESPONSE }));
}

/** Sobe uma foto pelo endpoint real e devolve a URL pública. */
export async function uploadPhoto(
  request: APIRequestContext,
  session: Session,
): Promise<string> {
  const response = await request.post(`${API_URL}/users/me/media`, {
    headers: { Authorization: `Bearer ${session.token}` },
    multipart: {
      kind: 'photo',
      files: { name: 'foto.png', mimeType: 'image/png', buffer: TINY_PNG },
    },
  });
  await assertOk(response, 'POST /users/me/media');
  const body = (await response.json()) as { items: { url: string }[] };
  return body.items[0].url;
}

export type PublishedProduct = { id: number; name: string; price: number };

/** Cria e publica uma peça pela API (setup rápido para jornadas de compra). */
export async function publishProduct(
  request: APIRequestContext,
  session: Session,
  overrides: { name?: string; price?: number } = {},
): Promise<PublishedProduct> {
  const image = await uploadPhoto(request, session);
  const name = overrides.name ?? uniqueName('Peça E2E');

  const created = await request.post(`${API_URL}/users/me/products`, {
    headers: { Authorization: `Bearer ${session.token}` },
    data: {
      name,
      description: 'Peça criada pela suíte E2E.',
      category: 'Roupas',
      size: 'M',
      color: 'Preto',
      condition: 'Seminovo',
      brand: 'Zara',
      price: overrides.price ?? 79.9,
      images: [image],
    },
  });
  await assertOk(created, 'POST /users/me/products');
  const draft = (await created.json()) as { id: number };

  const published = await request.post(`${API_URL}/users/me/products/${draft.id}/publish`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  await assertOk(published, `publish ${draft.id}`);
  const body = (await published.json()) as { id: number; name: string; price: number };
  return { id: body.id, name: body.name, price: body.price };
}

/** Aprova o comprovante pela API (o fluxo pela UI já tem spec próprio). */
export async function approvePayment(
  request: APIRequestContext,
  orderId: number,
  adminToken: string,
): Promise<void> {
  const response = await request.post(`${API_URL}/admin/payments/${orderId}/approve`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  await assertOk(response, `approve order ${orderId}`);
}

/**
 * Rejeita o comprovante pela API (RN-23): o Pedido volta a
 * `aguardando_comprovante` com o motivo gravado, e o comprador reenvia.
 * O fluxo de rejeição pela UI tem spec próprio em `admin.spec.ts`.
 */
export async function rejectPayment(
  request: APIRequestContext,
  orderId: number,
  adminToken: string,
  reason: string,
): Promise<void> {
  const response = await request.post(`${API_URL}/admin/payments/${orderId}/reject`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { reason },
  });
  await assertOk(response, `reject order ${orderId}`);
}
