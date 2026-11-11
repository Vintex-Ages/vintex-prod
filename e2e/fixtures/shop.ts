import { expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  ADDRESS,
  adoptSession,
  createStore,
  interceptViaCep,
  publishProduct,
  registerBuyer,
  TINY_PNG,
  type PublishedProduct,
  type Session,
} from './api';

export type PlacedOrder = {
  buyer: Session;
  orderId: number;
  paymentUrl: string;
  product: { id: number };
};

/**
 * Peça exclusiva do teste: vendedora nova, loja nova e peça publicada.
 *
 * O catálogo é compartilhado e a peça vira `reservado` ao entrar no checkout,
 * então dois testes em paralelo pegando a primeira peça ativa disputam a
 * mesma reserva — um deles fica preso no carrinho. Publicar a própria peça
 * elimina a corrida e a dependência dos seeds.
 */
export async function createBuyableProduct(
  request: APIRequestContext,
): Promise<PublishedProduct> {
  const seller = await registerBuyer(request, { name: 'Vendedora E2E' });
  await createStore(request, seller);
  return publishProduct(request, seller);
}

/**
 * Compra pela UI (produto → checkout → pedido), parando na tela de pagamento.
 * Sem `product`, publica uma peça só deste teste (`createBuyableProduct`).
 */
export async function placeOrder(
  page: Page,
  request: APIRequestContext,
  product?: { id: number },
): Promise<PlacedOrder> {
  const buyer = await registerBuyer(request);
  const chosen = product ?? (await createBuyableProduct(request));

  await adoptSession(page, buyer);
  await page.goto(`/product/${chosen.id}`);
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

  const paymentUrl = page.url();
  const orderId = Number(paymentUrl.match(/orders\/(\d+)/)?.[1]);

  return { buyer, orderId, paymentUrl, product: chosen };
}

/** Envia o comprovante e espera a etapa "Comprovante em análise". */
export async function uploadReceipt(page: Page): Promise<void> {
  await page.getByLabel('Comprovante do Pix').setInputFiles({
    name: 'comprovante.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  await page.getByRole('button', { name: 'Enviar comprovante' }).click();
  await expect(page.locator('[aria-current="step"]')).toContainText(
    /Comprovante em análise/i,
  );
}
