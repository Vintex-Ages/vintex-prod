import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/context/ToastContext';
import { AdminModerationError, suspendProduct } from '@/services/adminModerationService';
import type { ModerationResult } from '@/types/adminModeration';
import type { ProductStatus } from '@/types/product';
import SuspendProductAction from './SuspendProductAction';

vi.mock('@/services/adminModerationService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/adminModerationService')>()),
  suspendProduct: vi.fn(),
}));

// RED #414: o componente ainda não existe. Erro de import impede a coleta;
// não representa uma falha funcional demonstrada de cada cenário abaixo.
const PRODUCT_ID = '41401';
const REASON = 'As fotos não correspondem à peça.';
const SUSPENDED: ModerationResult = {
  productId: PRODUCT_ID,
  status: 'despublicado',
  moderationReason: REASON,
  moderatedAt: '2026-11-14T12:00:00',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderAction(status: ProductStatus = 'ativo') {
  const onSuspended = vi.fn();
  render(
    <MemoryRouter>
      <ToastProvider>
        <SuspendProductAction productId={PRODUCT_ID} status={status} onSuspended={onSuspended} />
      </ToastProvider>
    </MemoryRouter>,
  );
  return { onSuspended };
}

async function openDialog() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Suspender anúncio' }));
  const dialog = screen.getByRole('dialog', { name: /suspender anúncio/i });
  const field = within(dialog).getByRole('textbox', { name: /motivo|justificativa/i });
  return {
    user,
    dialog,
    field,
    confirm: within(dialog).getByRole('button', { name: /confirmar suspensão/i }),
  };
}

beforeEach(() => {
  vi.mocked(suspendProduct).mockReset().mockResolvedValue(SUSPENDED);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SuspendProductAction — RED #414', () => {
  it('abre um diálogo rotulado e um campo com label acessível', async () => {
    renderAction();
    const { dialog, field } = await openDialog();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(field).toHaveAccessibleName(/motivo|justificativa/i);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('cancelar não envia e devolve o foco ao botão de origem', async () => {
    renderAction();
    const trigger = screen.getByRole('button', { name: 'Suspender anúncio' });
    const { user, dialog, field } = await openDialog();
    await user.type(field, REASON);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(suspendProduct).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('Escape fecha sem enviar e devolve o foco', async () => {
    renderAction();
    const trigger = screen.getByRole('button', { name: 'Suspender anúncio' });
    const { user } = await openDialog();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(suspendProduct).not.toHaveBeenCalled();
  });

  it('integra o Dialog real: Tab e Shift+Tab permanecem no diálogo', async () => {
    renderAction();
    const { user, dialog } = await openDialog();
    const controls = within(dialog).getAllByRole('button');
    // Percorre mais passos que o número de controles, incluindo o textarea.
    for (let i = 0; i < controls.length + 3; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < controls.length + 3; i += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it.each(['', '   ', '\t\n'])('motivo %j não envia e associa erro ao campo', async (value) => {
    renderAction();
    const { field, confirm, dialog } = await openDialog();
    fireEvent.change(field, { target: { value } });
    fireEvent.click(confirm);
    expect(suspendProduct).not.toHaveBeenCalled();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(/informe|obrigatóri/i);
    expect(field.getAttribute('aria-describedby')).toBeTruthy();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/motivo|justificativa/i);
  });

  it('envia ID e motivo válidos e só comunica sucesso depois da resposta', async () => {
    const pending = deferred<ModerationResult>();
    vi.mocked(suspendProduct).mockReturnValue(pending.promise);
    const { onSuspended } = renderAction();
    const { user, field, confirm } = await openDialog();
    await user.type(field, REASON);
    await user.click(confirm);
    expect(suspendProduct).toHaveBeenCalledExactlyOnceWith(PRODUCT_ID, REASON);
    expect(onSuspended).not.toHaveBeenCalled();
    expect(screen.queryByText(/anúncio suspenso com sucesso/i)).not.toBeInTheDocument();
    await act(async () => pending.resolve(SUSPENDED));
    expect(onSuspended).toHaveBeenCalledExactlyOnceWith(SUSPENDED);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/suspens|suspenso/i);
  });

  it('durante envio bloqueia repetição e não fecha por Escape, cancelar ou fechar', async () => {
    const pending = deferred<ModerationResult>();
    vi.mocked(suspendProduct).mockReturnValue(pending.promise);
    renderAction();
    const { user, field, confirm, dialog } = await openDialog();
    await user.type(field, REASON);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(suspendProduct).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    await user.keyboard('{Escape}');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    expect(dialog).toBeInTheDocument();
    await act(async () => pending.resolve(SUSPENDED));
  });

  it('fields.reason preserva o texto e permite corrigir e reenviar', async () => {
    vi.mocked(suspendProduct).mockRejectedValueOnce(
      new AdminModerationError('REASON_REQUIRED', 'Dados inválidos.', 422, 'VALIDATION_ERROR', {
        reason: 'Explique a divergência nas fotos.',
      }),
    );
    const { onSuspended } = renderAction();
    const { user, field, confirm, dialog } = await openDialog();
    await user.type(field, REASON);
    await user.click(confirm);
    expect(dialog).toBeInTheDocument();
    expect(field).toHaveValue(REASON);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Explique a divergência nas fotos.');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Explique a divergência nas fotos.',
    );
    expect(onSuspended).not.toHaveBeenCalled();
    await user.clear(field);
    await user.type(field, 'A etiqueta mostra material diferente.');
    await user.click(confirm);
    expect(suspendProduct).toHaveBeenLastCalledWith(
      PRODUCT_ID,
      'A etiqueta mostra material diferente.',
    );
    expect(onSuspended).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      status: 'vendido' as const,
      code: 'PRODUCT_SOLD',
      message: 'Peça vendida não pode ser despublicada.',
      expected: /vendida/i,
    },
    {
      status: 'reservado' as const,
      code: 'PRODUCT_NOT_EDITABLE',
      message: 'O estado atual da peça não permite suspensão.',
      expected: /reservad|pedido em aberto/i,
    },
    {
      status: 'ativo' as const,
      code: 'CONFLICT',
      message: 'O estado atual impede esta operação.',
      expected: /estado atual|situação atual/i,
    },
  ])(
    '409 $code com status $status mantém contexto e explica o impedimento',
    async ({ status, code, message, expected }) => {
      vi.mocked(suspendProduct).mockRejectedValue(
        new AdminModerationError(code, message, 409, code),
      );
      const { onSuspended } = renderAction(status);
      const { user, field, confirm, dialog } = await openDialog();
      await user.type(field, REASON);
      await user.click(confirm);
      expect(within(dialog).getByRole('alert')).toHaveTextContent(expected);
      if (code === 'CONFLICT')
        expect(within(dialog).getByRole('alert')).not.toHaveTextContent(/vendida|reservada/i);
      expect(field).toHaveValue(REASON);
      expect(confirm).toBeEnabled();
      expect(onSuspended).not.toHaveBeenCalled();
      expect(screen.queryByText(/anúncio suspenso com sucesso/i)).not.toBeInTheDocument();
    },
  );

  it('falha genérica mantém diálogo, texto e possibilidade de nova tentativa', async () => {
    vi.mocked(suspendProduct).mockRejectedValueOnce(
      new AdminModerationError('NETWORK_ERROR', 'Sem conexão.'),
    );
    const { onSuspended } = renderAction();
    const { user, field, confirm, dialog } = await openDialog();
    await user.type(field, REASON);
    await user.click(confirm);
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      /conexão|suspender|tente novamente/i,
    );
    expect(field).toHaveValue(REASON);
    expect(onSuspended).not.toHaveBeenCalled();
    await user.click(confirm);
    expect(onSuspended).toHaveBeenCalledTimes(1);
  });
});
