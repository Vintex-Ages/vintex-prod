import { expect, test } from '@playwright/test';
import { ADMIN, adoptSession, API_URL, login } from '../fixtures/api';
import { placeOrder, uploadReceipt } from '../fixtures/shop';

/**
 * Administradora: fila de comprovantes → conferir → aprovar ou rejeitar.
 * O status é conferido na API; a tela só confirma o reflexo.
 */
test.describe('administração', () => {
  test('aprova o comprovante e confirma a venda', async ({ page, browser, request }) => {
    const order = await placeOrder(page, request);
    await uploadReceipt(page);

    const adminSession = await login(request, ADMIN.email, ADMIN.password);
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminContext.newPage();
    await adoptSession(adminPage, adminSession);

    await adminPage.goto('/admin/receipts');
    await expect(
      adminPage.getByRole('heading', { name: /Repasses de pagamentos Pix/i }),
    ).toBeVisible();
    await adminPage.getByRole('button', { name: 'Pendentes', exact: true }).click();

    await adminPage
      .getByRole('button', { name: `Ver comprovante do pedido #${order.orderId}` })
      .click();
    await adminPage.getByRole('button', { name: /Aprovar pagamento/i }).click();
    await adminPage.getByRole('button', { name: 'Confirmar aprovação' }).click();

    await expect
      .poll(
        async () => {
          const response = await request.get(
            `${API_URL}/users/me/orders/${order.orderId}`,
            { headers: { Authorization: `Bearer ${order.buyer.token}` } },
          );
          return ((await response.json()) as { status: string }).status;
        },
        { timeout: 15_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe('confirmado');

    await page.goto(order.paymentUrl.replace('/payment', ''));
    await expect(page.locator('[aria-current="step"]')).toContainText(/Pagamento confirmado/i);

    await adminContext.close();
  });

  test('rejeita com motivo e o comprador reenvia', async ({ page, browser, request }) => {
    const order = await placeOrder(page, request);
    await uploadReceipt(page);

    const reason = 'Comprovante ilegível: valor e data não aparecem.';
    const adminSession = await login(request, ADMIN.email, ADMIN.password);
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminContext.newPage();
    await adoptSession(adminPage, adminSession);

    await adminPage.goto('/admin/receipts');
    await adminPage.getByRole('button', { name: 'Pendentes', exact: true }).click();
    await adminPage
      .getByRole('button', { name: `Ver comprovante do pedido #${order.orderId}` })
      .click();

    await adminPage.getByRole('button', { name: /Rejeitar comprovante/i }).click();
    await adminPage.getByLabel('Motivo da rejeição').fill(reason);
    await adminPage.getByRole('button', { name: 'Confirmar rejeição' }).click();

    await expect
      .poll(
        async () => {
          const response = await request.get(
            `${API_URL}/users/me/orders/${order.orderId}`,
            { headers: { Authorization: `Bearer ${order.buyer.token}` } },
          );
          return ((await response.json()) as { status: string }).status;
        },
        { timeout: 15_000, intervals: [500, 1_000, 2_000] },
      )
      .toBe('aguardando_comprovante');

    // O comprador vê o motivo e consegue reenviar.
    await page.goto(order.paymentUrl);
    await expect(page.getByText(/Comprovante recusado/i)).toBeVisible();
    await expect(page.getByText(reason)).toBeVisible();

    await uploadReceipt(page);
    await expect(page.locator('[aria-current="step"]')).toContainText(
      /Comprovante em análise/i,
    );

    await adminContext.close();
  });
});
