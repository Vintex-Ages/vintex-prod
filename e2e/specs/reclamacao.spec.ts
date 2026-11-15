import { expect, test } from '@playwright/test';
import { ADMIN, adoptSession, API_URL, login } from '../fixtures/api';
import { placeOrder, uploadReceipt } from '../fixtures/shop';

/**
 * Reclamação sobre Pedido: o comprador reporta, a administradora lê (RN-77 a
 * RN-79; front-end#441, back-end#353).
 *
 * Esta jornada existe porque o front chamava `/reports` e o back serve
 * `/complaints`: o caminho, o envelope de erro e a ordem da fila só se provam
 * com a API de verdade. Teste de componente não pega nada disso.
 */
test.describe('reclamação', () => {
  test('comprador reporta problema e a administradora vê a reclamação', async ({
    page,
    browser,
    request,
  }) => {
    const order = await placeOrder(page, request);
    await uploadReceipt(page);

    const adminSession = await login(request, ADMIN.email, ADMIN.password);
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminContext.newPage();
    await adoptSession(adminPage, adminSession);

    // Só Pedido confirmado aceita Reclamação (RN-77): a aprovação do
    // comprovante é o que leva o Pedido a esse status.
    await adminPage.goto('/admin/receipts');
    await adminPage.getByRole('button', { name: 'Pendentes', exact: true }).click();
    await adminPage
      .getByRole('button', { name: `Ver comprovante do pedido #${order.orderId}` })
      .click();
    await adminPage.getByRole('button', { name: /Aprovar pagamento/i }).click();
    await adminPage.getByRole('button', { name: 'Confirmar aprovação' }).click();

    await expect
      .poll(
        async () => {
          const response = await request.get(`${API_URL}/users/me/orders/${order.orderId}`, {
            headers: { Authorization: `Bearer ${order.buyer.token}` },
          });
          return ((await response.json()) as { status: string }).status;
        },
        { timeout: 15_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe('confirmado');

    const texto = `A jaqueta do pedido ${order.orderId} chegou com a manga rasgada.`;
    await page.goto(`/profile/orders/${order.orderId}`);
    await page.getByRole('button', { name: 'Reportar problema' }).click();
    await page.getByLabel('Motivo').selectOption('danificado');
    await page.getByLabel('Descrição').fill(texto);
    await page.getByRole('button', { name: 'Enviar reclamação' }).click();
    await expect(page.getByRole('status')).toContainText('Reclamação enviada à administradora');

    // Segunda Reclamação no mesmo Pedido: o `UNIQUE` de `order_id` recusa com
    // `ALREADY_REPORTED`, e a mensagem do back chega à tela.
    await page.getByRole('button', { name: 'Entendi' }).click();
    await page.getByRole('button', { name: 'Reportar problema' }).click();
    await page.getByLabel('Motivo').selectOption('nao_recebido');
    await page.getByLabel('Descrição').fill('Reportando de novo para conferir a trava.');
    await page.getByRole('button', { name: 'Enviar reclamação' }).click();
    await expect(page.getByText('Este pedido já tem um problema reportado.')).toBeVisible();

    await adminPage.goto('/admin/reports');
    await expect(adminPage.getByRole('heading', { name: 'Reclamações' })).toBeVisible();
    const cartao = adminPage.getByRole('listitem').filter({
      has: adminPage.getByRole('heading', { name: `Pedido #${order.orderId}` }),
    });
    await expect(cartao).toHaveCount(1);
    await expect(cartao).toContainText(texto);
    await expect(cartao).toContainText('Danificado');

    await adminContext.close();
  });
});
