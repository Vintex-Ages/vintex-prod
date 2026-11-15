import { expect, test } from '@playwright/test';
import {
  ADDRESS,
  adoptSession,
  API_URL,
  createStore,
  interceptViaCep,
  registerBuyer,
  TINY_PNG,
  uniqueName,
  validCnpj,
} from '../fixtures/api';
import { acceptDocumentModal } from '../fixtures/ui';

/**
 * Jornada do vendedor: abrir loja (contrato + documento) → publicar peça
 * (foto + sugestão da IA) → revisão → anúncio ativo no catálogo.
 */
test.describe('vendedor', () => {
  test('abre a loja pela UI e publica a primeira peça', async ({ page, request }) => {
    const session = await registerBuyer(request, { name: 'Vendedora E2E' });
    const storeName = uniqueName('Brechó Publicado');
    const title = `Jaqueta E2E ${Date.now().toString(36)}`;

    await adoptSession(page, session);
    await interceptViaCep(page);

    await page.goto('/sell');
    await expect(page.getByRole('heading', { name: 'Quero vender' })).toBeVisible();

    // O contrato abre sozinho e bloqueia o formulário até o aceite.
    await acceptDocumentModal(page);

    await page.getByLabel('Nome da loja').fill(storeName);
    await page.getByLabel('Descrição (opcional)').fill('Brechó criado pela suíte E2E.');
    await page.getByRole('radio', { name: 'CNPJ' }).check();
    await page.getByLabel('Número do CNPJ').fill(validCnpj());

    await page.getByLabel('CEP', { exact: true }).fill(ADDRESS.cep);
    await page.getByLabel('Rua').fill(ADDRESS.street);
    await page.getByLabel('Número', { exact: true }).fill(ADDRESS.number);
    await page.getByLabel('Bairro').fill(ADDRESS.neighborhood);
    await page.getByLabel('Cidade').fill(ADDRESS.city);
    await page.getByLabel('UF').selectOption(ADDRESS.state);
    await page.getByLabel('Chave Pix').fill(`pix+${Date.now()}@vintex.example.com`);

    await page.getByRole('button', { name: 'Abrir minha loja' }).click();
    await expect(page).toHaveURL(/\/seller$/);

    await page.getByRole('button', { name: 'Anunciar peça' }).first().click();
    await expect(page).toHaveURL(/\/seller\/products\/new$/);

    // A foto dispara upload + análise; o provider fake preenche os campos.
    await page.locator('#fotos-input').setInputFiles({
      name: 'frente.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await expect(page.getByRole('combobox', { name: 'Categoria' })).toHaveValue('Roupas');
    await expect(page.getByLabel('Descrição')).toHaveValue(/caimento reto/);

    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Preço').fill('89,90');

    await page.getByRole('button', { name: 'Continuar para revisão' }).click();
    await expect(page).toHaveURL(/\/seller\/products\/\d+\/review$/);
    await expect(page.getByRole('heading', { name: 'Revise sua peça antes de publicar' })).toBeVisible();
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: /Confirmar e publicar peça/i }).click();
    await expect(page).toHaveURL(/\/seller$/);
    await expect(page.getByText(/Peça publicada/i)).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();

    // Confirma no catálogo real, não só na tela do vendedor.
    const feed = await request.get(`${API_URL}/products?q=${encodeURIComponent(title)}`);
    expect(feed.ok()).toBeTruthy();
    const body = (await feed.json()) as { total: number; items: { name: string }[] };
    expect(body.total).toBe(1);
    expect(body.items[0].name).toBe(title);
  });

  test('abrir loja via API e editar a loja pela UI', async ({ page, request }) => {
    const session = await registerBuyer(request, { name: 'Vendedora Edição' });
    const store = await createStore(request, session, { name: uniqueName('Brechó Editado') });

    await adoptSession(page, session);
    await page.goto('/seller/store');

    await expect(page.getByRole('heading', { name: 'Editar loja' })).toBeVisible();
    const description = page.getByLabel('Descrição (opcional)');
    await description.fill('Descrição atualizada pela suíte E2E.');
    await page.getByRole('button', { name: /Salvar/i }).click();

    await expect(page.getByText(/Loja atualizada/i)).toBeVisible();

    const response = await request.get(`${API_URL}/stores/${store.id}`);
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { description: string };
    expect(body.description).toBe('Descrição atualizada pela suíte E2E.');
  });
});
