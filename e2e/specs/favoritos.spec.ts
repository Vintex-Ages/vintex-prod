import { expect, test } from '@playwright/test';
import { adoptSession, firstAvailableProduct, registerBuyer } from '../fixtures/api';

/** Favoritos: coração na peça → lista em "Meus favoritos" → remover. */
test.describe('favoritos', () => {
  test('favorita pela peça e aparece na lista', async ({ page, request }) => {
    const buyer = await registerBuyer(request);
    const product = await firstAvailableProduct(request);

    await adoptSession(page, buyer);
    await page.goto(`/product/${product.id}`);

    await page.getByRole('button', { name: 'Adicionar aos favoritos' }).click();
    await expect(page.getByRole('button', { name: 'Remover dos favoritos' })).toBeVisible();

    await page.goto('/profile/favorites');
    await expect(page.getByRole('heading', { name: 'Meus favoritos' })).toBeVisible();
    await expect(page.getByText(product.name, { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: `Remover ${product.name}` }).first().click();
    await expect(page.getByText('Você ainda não favoritou nenhuma peça')).toBeVisible();
  });
});
