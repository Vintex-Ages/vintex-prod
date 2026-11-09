import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { adoptSession, registerBuyer } from '../fixtures/api';

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'catálogo', path: '/catalog' },
  { name: 'brechós', path: '/stores' },
  { name: 'login', path: '/login' },
  { name: 'cadastro', path: '/register' },
  { name: 'conversa com a Vintex', path: '/vintex' },
];

for (const target of PAGES) {
  test(`a11y: ${target.name} sem violações sérias`, async ({ page }) => {
    await page.goto(target.path);
    await expect(page.getByRole('banner')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const violations = results.violations
      .filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))
      .map((violation) => ({
        regra: violation.id,
        impacto: violation.impact,
        alvos: violation.nodes.map((node) => node.target.join(' ')),
        ajuda: violation.help,
      }));

    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
}

test('a11y: pedido em análise (área logada)', async ({ page, request }) => {
  const buyer = await registerBuyer(request);
  await adoptSession(page, buyer);

  await page.goto('/profile/orders');
  await expect(page.getByRole('banner')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const violations = results.violations.filter((violation) =>
    ['critical', 'serious'].includes(violation.impact ?? ''),
  );

  expect(
    violations.map((violation) => violation.id),
    'violações critical/serious na lista de pedidos',
  ).toEqual([]);
});
