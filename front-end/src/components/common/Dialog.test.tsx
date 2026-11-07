import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dialog from './Dialog';

afterEach(cleanup);

function renderDialog(props: Partial<Parameters<typeof Dialog>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <Dialog
      open
      onClose={onClose}
      title="Remover peça?"
      description="A peça sai do carrinho."
      {...props}
    >
      <button type="button">Ação do conteúdo</button>
    </Dialog>,
  );
  return { onClose };
}

describe('<Dialog />', () => {
  it('é um diálogo modal rotulado pelo título e descrito pela descrição', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Remover peça?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('A peça sai do carrinho.');
  });

  it('não renderiza nada fechado', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Objetivo: garantir a acessibilidade do modal.
  it('fecha com ESC', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('prende o foco nos dois sentidos', async () => {
    const user = userEvent.setup();
    renderDialog();

    const close = screen.getByRole('button', { name: 'Fechar' });
    const content = screen.getByRole('button', { name: 'Ação do conteúdo' });
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(content).toHaveFocus();

    await user.tab();
    expect(close).toHaveFocus();
  });

  it('devolve o foco a quem abriu ao fechar', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Título">
        conteúdo
      </Dialog>,
    );
    rerender(
      <Dialog open={false} onClose={() => {}} title="Título">
        conteúdo
      </Dialog>,
    );

    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('clique no fundo fecha por padrão, mas não clique dentro do painel', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Ação do conteúdo' }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clique no fundo não fecha com closeOnBackdrop={false}', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ closeOnBackdrop: false });

    await user.click(screen.getByTestId('dialog-backdrop'));

    expect(onClose).not.toHaveBeenCalled();
  });
});
