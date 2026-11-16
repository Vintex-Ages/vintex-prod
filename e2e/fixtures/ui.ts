import { expect, type Page } from '@playwright/test';

/**
 * Aceita o modal de documento (termos/contrato) que só habilita o botão no
 * fim da rolagem. Devolve quando o diálogo fecha.
 */
export async function acceptDocumentModal(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.evaluate((element) => {
    const scrollables = Array.from(element.querySelectorAll<HTMLElement>('*')).filter(
      (node) => node.scrollHeight > node.clientHeight + 4,
    );
    for (const node of scrollables) {
      node.scrollTop = node.scrollHeight;
      node.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
  });

  const accept = dialog.getByRole('button', { name: 'Aceitar', exact: true });
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(dialog).toBeHidden();
}
