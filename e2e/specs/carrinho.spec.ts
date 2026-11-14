import { expect, test } from '@playwright/test';
import { adoptSession, firstAvailableProduct, registerBuyer } from '../fixtures/api';

/** Carrinho: adicionar pela peça, conferir, remover e seguir ao checkout. */
test.describe('carrinho', () => {
  test('adiciona peça e segue para o checkout', async ({ page, request }) => {
    const buyer = await registerBuyer(request);
    const product = await firstAvailableProduct(request);

    await adoptSession(page, buyer);
    await page.goto(`/product/${product.id}`);

    await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
    await expect(page.getByRole('button', { name: 'No carrinho' })).toBeVisible();

    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Seu carrinho' })).toBeVisible();
    await expect(page.getByText(product.name, { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Finalizar compra' }).click();
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('remove a peça e o carrinho fica vazio', async ({ page, request }) => {
    const buyer = await registerBuyer(request);
    const product = await firstAvailableProduct(request);

    await adoptSession(page, buyer);
    await page.goto(`/product/${product.id}`);
    await page.getByRole('button', { name: 'Adicionar ao carrinho' }).click();
    await expect(page.getByRole('button', { name: 'No carrinho' })).toBeVisible();

    await page.goto('/cart');
    await page.getByRole('button', { name: `Remover ${product.name}` }).click();

    await expect(page.getByText('Seu carrinho está vazio')).toBeVisible();
    await expect(page.getByRole('button', { name: /Carrinho, 0 itens/ })).toBeVisible();
  });
});
