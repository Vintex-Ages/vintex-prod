import { expect, test } from '@playwright/test';
import {
  ADDRESS,
  BUYER_PASSWORD,
  interceptViaCep,
  registerBuyer,
  uniqueEmail,
} from '../fixtures/api';
import { acceptDocumentModal } from '../fixtures/ui';

test.describe('conta', () => {
  test('cadastro pela UI, termos e onboarding', async ({ page }) => {
    await interceptViaCep(page);

    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible();

    await page.getByLabel('Nome completo').fill('Compradora UI E2E');
    await page.getByLabel('E-mail').fill(uniqueEmail('ui'));
    await page.getByLabel('Telefone celular com DDD').fill('(51) 99999-0000');
    await page.getByLabel('CEP (auto-preenchimento)').fill(ADDRESS.cep);
    await page.getByLabel('Senha').fill(BUYER_PASSWORD);

    // O CEP resolve pelo ViaCEP interceptado; o formulário exige status resolvido.
    await expect(page.getByText(/Cidade Baixa, Porto Alegre/)).toBeVisible();

    // O clique no checkbox abre o modal de termos; a marcação vem do "Aceitar".
    await page.getByRole('checkbox').click();
    await acceptDocumentModal(page);

    await page.getByRole('button', { name: 'Criar conta e personalizar estilos' }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { name: 'Qual é a sua estética?' })).toBeVisible();

    await page.getByRole('button', { name: /SALVAR ESTILOS E ABRIR MEU FEED/i }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: /Compradora UI E2E/ })).toBeVisible();
  });

  test('login e logout pela UI', async ({ page, request }) => {
    const buyer = await registerBuyer(request);

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Entre na Vintex' })).toBeVisible();

    await page.getByLabel('E-mail').fill(buyer.user.email);
    await page.getByLabel('Senha').fill(BUYER_PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('button', { name: /Compradora E2E/ })).toBeVisible();

    await page.getByRole('button', { name: /Compradora E2E/ }).click();
    await page.getByRole('button', { name: 'Sair' }).click();

    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('sessão vencida volta ao login preservando o destino', async ({ page, request }) => {
    // Conta real: depois de cair no login, o teste entra pela tela de verdade.
    const buyer = await registerBuyer(request);

    await page.addInitScript(() => {
      window.sessionStorage.setItem('vintex.auth.token', 'token-invalido');
      window.sessionStorage.setItem(
        'vintex.auth.user',
        JSON.stringify({ id: 999, name: 'Sessão Vencida', email: 'vencida@vintex.example.com', is_admin: false }),
      );
      window.sessionStorage.setItem('vintex.auth.refreshToken', 'refresh-invalido');
    });

    await page.goto('/profile/favorites');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Entre na Vintex' })).toBeVisible();

    // O destino vive em `state.from` do history, não na URL: nenhuma asserção
    // de URL o observa. Só o pós-login prova que a guarda (e o 401) o guardaram.
    await page.getByLabel('E-mail').fill(buyer.user.email);
    await page.getByLabel('Senha').fill(BUYER_PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page).toHaveURL(/\/profile\/favorites$/);
    await expect(page.getByRole('heading', { name: 'Meus favoritos' })).toBeVisible();
  });
});
