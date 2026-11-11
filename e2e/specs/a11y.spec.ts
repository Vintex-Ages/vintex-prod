import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, login, rejectPayment } from '../fixtures/api';
import { placeOrder, uploadReceipt } from '../fixtures/shop';

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'catálogo', path: '/catalog' },
  { name: 'brechós', path: '/stores' },
  { name: 'login', path: '/login' },
  { name: 'cadastro', path: '/register' },
  { name: 'conversa com a Vintex', path: '/vintex' },
];

/** Roda o axe e falha listando regra, impacto e alvo de cada achado grave. */
async function expectSemViolacoesGraves(page: Page, contexto: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

  const violations = results.violations
    .filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))
    .map((violation) => ({
      regra: violation.id,
      impacto: violation.impact,
      alvos: violation.nodes.map((node) => node.target.join(' ')),
      ajuda: violation.help,
    }));

  expect(
    violations,
    `violações critical/serious em ${contexto}\n${JSON.stringify(violations, null, 2)}`,
  ).toEqual([]);
}

for (const target of PAGES) {
  test(`a11y: ${target.name} sem violações sérias`, async ({ page }) => {
    await page.goto(target.path);
    await expect(page.getByRole('banner')).toBeVisible();

    await expectSemViolacoesGraves(page, target.name);
  });
}

test('a11y: pedido em análise e comprovante recusado', async ({ page, request }) => {
  // Quatro estados, cada um com uma varredura completa do axe: não cabe nos
  // 60 s do resto da suíte, que é uma navegação só por teste.
  test.setTimeout(120_000);

  // Um Pedido de verdade: sem ele o axe varria o estado vazio de Meus pedidos,
  // e a linha do tempo, o `aria-current` e os selos ficavam de fora.
  const order = await placeOrder(page, request);
  // Termina no detalhe do Pedido, com a etapa atual "Comprovante em análise".
  await uploadReceipt(page);

  // Lista: o cartão do Pedido traz o selo da situação.
  await page.goto('/profile/orders');
  await expect(page.getByText(`Pedido #${order.orderId}`).first()).toBeVisible();
  await expect(page.getByText('Comprovante em análise').first()).toBeVisible();
  await expectSemViolacoesGraves(page, 'Meus pedidos com pedido em análise');

  // Detalhe: linha do tempo com a etapa atual e a situação do comprovante.
  await page.goto(`/profile/orders/${order.orderId}`);
  await expect(page.locator('[aria-current="step"]')).toContainText(/Comprovante em análise/i);
  await expect(page.getByRole('heading', { name: 'Detalhe do pedido' })).toBeVisible();
  await expectSemViolacoesGraves(page, 'detalhe do pedido em análise');

  // Recusa pela API — o fluxo pela UI já tem spec próprio (`admin.spec.ts`) —
  // coloca a tela no estado que oferece "Reenviar comprovante".
  const admin = await login(request, ADMIN.email, ADMIN.password);
  await rejectPayment(
    request,
    order.orderId,
    admin.token,
    'Comprovante ilegível: valor e data não aparecem.',
  );

  // Pagamento: aviso de recusa (`role="alert"`) e envio de outro arquivo.
  await page.goto(order.paymentUrl);
  await expect(page.getByText('Comprovante recusado').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reenviar comprovante' })).toBeVisible();
  await expectSemViolacoesGraves(page, 'pagamento com comprovante recusado');

  // Detalhe: o aviso de recusa e a ação de reenvio.
  await page.goto(`/profile/orders/${order.orderId}`);
  await expect(page.getByText('Comprovante recusado').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reenviar comprovante' })).toBeVisible();
  await expectSemViolacoesGraves(page, 'detalhe com comprovante recusado');
});
