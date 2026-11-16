import { expect, test } from '@playwright/test';

/**
 * Chat da Vintex: a pergunta vira evento SSE no servidor (interpretação +
 * peças) e a resposta é renderizada como cartões do catálogo real.
 */
test.describe('assistente', () => {
  test('responde com peças do catálogo via streaming', async ({ page }) => {
    await page.goto('/vintex');

    await expect(page.getByRole('heading', { name: 'Conversa com a Vintex' })).toBeVisible();

    const input = page.getByRole('searchbox', { name: 'Buscar' });
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeDisabled();

    await input.fill('vestido preto');
    await page.getByRole('button', { name: 'Enviar' }).click();

    await expect(page.getByText('vestido preto').first()).toBeVisible();
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('sugestão preenche a pergunta sem enviar', async ({ page }) => {
    await page.goto('/vintex');

    await page.getByRole('button', { name: 'Até R$ 250' }).click();
    await expect(page.getByRole('searchbox', { name: 'Buscar' })).toHaveValue(
      'Tenho até R$ 250',
    );
  });
});
