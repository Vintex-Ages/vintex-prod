import { expect, test } from '@playwright/test';
import {
  adoptSession,
  firstAvailableProduct,
  interceptViaCep,
  registerBuyer,
} from '../fixtures/api';

/** Lista consolidada de pedidos e detalhe do pedido. */
test.describe('pedidos', () => {
  test('lista mostra o pedido e abre o detalhe', async ({ page, request }) => {
    const buyer = await registerBuyer(request);
    const product = await firstAvailableProduct(request);

    await adoptSession(page, buyer);
    await page.goto(`/product/${product.id}`);
    await page.getByRole('button', { name: /Comprar Agora/ }).click();

    await expect(page).toHaveURL(/\/checkout$/);
    await interceptViaCep(page);
    await page.getByLabel('CEP').fill('90035-072');
    await page.getByLabel('Rua').fill('Rua da Praia');
    await page.getByLabel('Número').fill('123');
    await page.getByLabel('Bairro').fill('Cidade Baixa');
    await page.getByLabel('Cidade').fill('Porto Alegre');
    await page.getByLabel('UF').selectOption('RS');
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    await expect(page).toHaveURL(/\/profile\/orders\/\d+\/payment$/);
    const orderId = Number(page.url().match(/orders\/(\d+)/)?.[1]);

    await page.goto('/profile/orders');
    await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible();
    await expect(page.getByText(`Pedido #${orderId}`).first()).toBeVisible();

    await page.getByText(`Pedido #${orderId}`).first().click();
    await expect(page).toHaveURL(new RegExp(`/profile/orders/${orderId}$`));
    await expect(page.getByText(product.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Detalhe do pedido' })).toBeVisible();
  });
});
