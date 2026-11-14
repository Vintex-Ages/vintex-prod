import { expect, test } from '@playwright/test';

/**
 * Busca por foto: a imagem vai no corpo da requisição, a IA interpreta e o
 * catálogo responde com peças parecidas. Nenhum upload público é criado.
 */
test.describe('busca por imagem', () => {
  test('foto no catálogo vira resultados', async ({ page }) => {
    await page.goto('/catalog');
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: 'foto.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      ),
    });

    await expect(page).toHaveURL(/modo=imagem/);
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
