import { expect, test } from '@playwright/test';

/** Vitrine pública além da home: lista de brechós e perfil da loja. */
test.describe('vitrine', () => {
  test('lista de brechós abre o perfil da loja', async ({ page }) => {
    await page.goto('/stores');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // O cartão inteiro é clicável, mas o nome acessível vem do botão do título.
    const firstStore = page.locator('article h3 button').first();
    await expect(firstStore).toBeVisible();
    const storeName = (await firstStore.textContent())?.trim() ?? '';
    // `?? ''` sozinho casaria com qualquer heading (toda string contém ''):
    // exige nome antes de usá-lo como asserção do h1 da loja.
    expect(storeName, 'nome da loja no cartão').not.toBe('');
    await firstStore.click();

    await expect(page).toHaveURL(/\/store\/\d+$/);
    await expect(page.getByRole('heading', { level: 1, name: storeName })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Peças da loja' })).toBeVisible();
  });

  test('catálogo filtra por categoria e volta para tudo', async ({ page }) => {
    await page.goto('/catalog');
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();

    // O rótulo é "Calçados"; o valor do filtro (e da URL) é "Sapatos".
    await page.getByRole('button', { name: 'Calçados', exact: true }).click();
    await expect(page).toHaveURL(/category=Sapatos/);
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();

    await page.getByRole('button', { name: 'Tudo', exact: true }).click();
    await expect(page).not.toHaveURL(/category=Sapatos/);
  });
});
