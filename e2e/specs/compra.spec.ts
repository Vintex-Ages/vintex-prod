import { expect, test } from '@playwright/test';
import {
  ADDRESS,
  adoptSession,
  firstAvailableProduct,
  interceptViaCep,
  registerBuyer,
  TINY_PNG,
} from '../fixtures/api';

/**
 * Jornada do dinheiro: cadastro (API) → peça → checkout → pedido → Pix →
 * comprovante. É a jornada que expõe contrato de storage, status e permissão.
 */
test.describe('compra', () => {
  test('comprador finaliza pedido e envia comprovante', async ({ page, request }) => {
    const buyer = await registerBuyer(request);
    await adoptSession(page, buyer);

    const product = await firstAvailableProduct(request);

    await page.goto(`/product/${product.id}`);
    await expect(page.getByRole('button', { name: /Comprar Agora/ })).toBeVisible();
    await page.getByRole('button', { name: /Comprar Agora/ }).click();

    await expect(page).toHaveURL(/\/checkout$/);
    await interceptViaCep(page);

    await page.getByLabel('CEP').fill(ADDRESS.cep);
    await page.getByLabel('Rua').fill(ADDRESS.street);
    await page.getByLabel('Número').fill(ADDRESS.number);
    await page.getByLabel('Bairro').fill(ADDRESS.neighborhood);
    await page.getByLabel('Cidade').fill(ADDRESS.city);
    await page.getByLabel('UF').selectOption(ADDRESS.state);

    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    await expect(page).toHaveURL(/\/profile\/orders\/\d+\/payment$/);
    await expect(page.getByText(/Chave Pix/i)).toBeVisible();

    await page.getByLabel('Comprovante do Pix').setInputFiles({
      name: 'comprovante.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });
    await page.getByRole('button', { name: 'Enviar comprovante' }).click();

    // A etapa ATUAL da linha do tempo, não o rótulo (que existe sempre).
    await expect(page.locator('[aria-current="step"]')).toContainText(
      /Comprovante em análise/i,
    );
  });
});
