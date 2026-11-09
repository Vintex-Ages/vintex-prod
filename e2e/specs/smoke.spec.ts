import { expect, test } from '@playwright/test';

/**
 * Smoke: o mínimo que precisa estar de pé para a vitrine funcionar.
 * Roda em desktop e em WebKit no viewport de iPhone (projeto mobile-webkit).
 */
test.describe('visitante', () => {
  test('home → catálogo → produto', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('banner')).toBeVisible();

    await page.getByRole('link', { name: 'Catálogo', exact: true }).first().click();
    await expect(page).toHaveURL(/\/catalog$/);

    const cards = page.locator('a[href^="/product/"]');
    await expect(cards.first()).toBeVisible();
    await cards.first().click();

    await expect(page).toHaveURL(/\/product\/\d+/);
    await expect(page.getByRole('button', { name: /Comprar Agora/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('busca por texto devolve peças', async ({ page }) => {
    await page.goto('/catalog');

    // `getByLabel('Buscar')` casa também com o input de foto (aria-label
    // "Buscar por foto"): o role searchbox separa os dois.
    const search = page.getByRole('searchbox', { name: 'Buscar' });
    await search.fill('vestido');
    await search.press('Enter');

    await expect(page).toHaveURL(/\/catalog\?.*q=vestido/);
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
  });

  test('rota protegida leva ao login', async ({ page }) => {
    await page.goto('/profile/favorites');
    await expect(page).toHaveURL(/\/login/);
    // A URL sozinha não prova que a tela pintou: espera o formulário.
    await expect(page.getByRole('heading', { name: 'Entre na Vintex' })).toBeVisible();
  });
});
