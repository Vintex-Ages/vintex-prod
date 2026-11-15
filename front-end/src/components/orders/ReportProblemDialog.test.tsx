import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OrderReportError, reportOrder } from '@/services/reportService';
import ReportProblemDialog from './ReportProblemDialog';

vi.mock('@/services/reportService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/reportService')>()),
  reportOrder: vi.fn(),
}));

/** "Reportar problema" no Pedido (FE-US025-1, #410; RN-77/RN-78). */

const REPORT = {
  id: 'r_1',
  orderId: 'ped-1',
  reason: 'danificado' as const,
  description: 'A manga veio rasgada.',
  createdAt: '2026-10-29T12:00:00Z',
};

function renderDialog(onClose = vi.fn()) {
  render(<ReportProblemDialog open orderId="ped-1" onClose={onClose} />);
  return { onClose };
}

function motivo() {
  return screen.getByRole('combobox', { name: 'Motivo' });
}

function descricao() {
  return screen.getByRole('textbox', { name: 'Descrição' });
}

function enviar() {
  fireEvent.click(screen.getByRole('button', { name: 'Enviar reclamação' }));
}

beforeEach(() => {
  vi.mocked(reportOrder).mockReset();
});

afterEach(cleanup);

describe('<ReportProblemDialog />', () => {
  it('motivo é escolha entre os dois, não digitação', () => {
    renderDialog();

    const opcoes = Array.from((motivo() as HTMLSelectElement).options)
      .filter((option) => option.value !== '')
      .map((option) => [option.value, option.textContent]);
    expect(opcoes).toEqual([
      ['nao_recebido', 'Não recebi o pedido'],
      ['danificado', 'Chegou danificado'],
    ]);
  });

  // Teste 1 (parte do formulário): envia e mostra só a confirmação.
  it('envia motivo e descrição e mostra só a confirmação', async () => {
    vi.mocked(reportOrder).mockResolvedValue(REPORT);
    renderDialog();

    fireEvent.change(motivo(), { target: { value: 'danificado' } });
    fireEvent.change(descricao(), { target: { value: 'A manga veio rasgada.' } });
    enviar();

    const confirmacao = await screen.findByRole('status');
    expect(confirmacao).toHaveTextContent(/enviada à administradora/i);
    expect(reportOrder).toHaveBeenCalledWith('ped-1', 'danificado', 'A manga veio rasgada.');
    // RN-78: nada da Reclamação volta para a tela.
    expect(screen.queryByText('A manga veio rasgada.')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // O botão de envio sumiu: o foco vai para "Entendi" e não escapa do diálogo.
    expect(screen.getByRole('button', { name: 'Entendi' })).toHaveFocus();
  });

  // Teste 3: descrição vazia (ADR 0003).
  it('descrição vazia não envia: erro no campo, resumo único e foco no campo', async () => {
    renderDialog();

    fireEvent.change(motivo(), { target: { value: 'nao_recebido' } });
    fireEvent.change(descricao(), { target: { value: '   ' } });
    enviar();

    expect(reportOrder).not.toHaveBeenCalled();
    expect(descricao()).toHaveAttribute('aria-invalid', 'true');
    // O contador do teto (#441) entra na descrição acessível, depois do erro.
    expect(descricao()).toHaveAccessibleDescription('Descreva o problema. 3/1000');
    // Uma região `alert` só: a do resumo, não a do campo.
    const alertas = screen.getAllByRole('alert');
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toHaveTextContent('Confira 1 campo antes de continuar:');
    expect(descricao()).toHaveFocus();
  });

  it('sem motivo nem descrição: dois erros e foco no primeiro campo da tela', () => {
    renderDialog();

    enviar();

    expect(reportOrder).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Confira 2 campos antes de continuar:');
    expect(motivo()).toHaveAccessibleDescription('Escolha o motivo.');
    expect(motivo()).toHaveFocus();
  });

  // Teste 4: erro do back.
  it('erro do back mostra a mensagem dele e mantém o formulário', async () => {
    vi.mocked(reportOrder).mockRejectedValue(
      new OrderReportError('ORDER_NOT_REPORTABLE', 'Pedido ainda não confirmado.'),
    );
    renderDialog();

    fireEvent.change(motivo(), { target: { value: 'nao_recebido' } });
    fireEvent.change(descricao(), { target: { value: 'Não chegou.' } });
    enviar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Pedido ainda não confirmado.');
    expect(descricao()).toHaveValue('Não chegou.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar reclamação' })).toBeEnabled();
  });

  it('422 do back com campo vai para o campo e para o resumo', async () => {
    vi.mocked(reportOrder).mockRejectedValue(
      new OrderReportError('VALIDATION_ERROR', 'Descrição muito curta.', 'description'),
    );
    renderDialog();

    fireEvent.change(motivo(), { target: { value: 'danificado' } });
    fireEvent.change(descricao(), { target: { value: 'ok' } });
    enviar();

    expect(await screen.findByRole('alert')).toHaveTextContent('Confira 1 campo');
    expect(descricao()).toHaveAccessibleDescription('Descrição muito curta. 2/1000');
    expect(descricao()).toHaveFocus();
  });

  it('falha inesperada não quebra a tela', async () => {
    vi.mocked(reportOrder).mockRejectedValue(new Error('rede caiu'));
    renderDialog();

    fireEvent.change(motivo(), { target: { value: 'danificado' } });
    fireEvent.change(descricao(), { target: { value: 'Rasgou.' } });
    enviar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível enviar a reclamação. Tente de novo.',
    );
  });

  it('Cancelar fecha sem enviar', () => {
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalled();
    expect(reportOrder).not.toHaveBeenCalled();
  });

  it('não usa nenhuma cor em hex cru', () => {
    renderDialog();
    expect(document.body.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  // #441: o back recusa descrição acima de 1000 caracteres.
  it('a descrição para em 1000 caracteres, com contador', () => {
    renderDialog();

    expect(descricao()).toHaveAttribute('maxLength', '1000');
    expect(descricao()).toHaveAccessibleDescription('0/1000');

    fireEvent.change(descricao(), { target: { value: 'a'.repeat(1000) } });

    expect(screen.getByText('1000/1000')).toBeInTheDocument();
    expect(descricao()).toHaveAccessibleDescription('1000/1000');
  });

  // #441: a segunda Reclamação no mesmo Pedido volta 409 e a mensagem do back chega à tela.
  it('409 ALREADY_REPORTED mostra a mensagem do back e mantém o formulário', async () => {
    vi.mocked(reportOrder).mockRejectedValue(
      new OrderReportError('ALREADY_REPORTED', 'Este pedido já tem um problema reportado.'),
    );
    renderDialog();

    fireEvent.change(motivo(), { target: { value: 'danificado' } });
    fireEvent.change(descricao(), { target: { value: 'De novo.' } });
    enviar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este pedido já tem um problema reportado.',
    );
    expect(descricao()).toHaveValue('De novo.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('no modo mock, reportar de novo o mesmo Pedido mostra a recusa do service', async () => {
    const actual = await vi.importActual<typeof import('@/services/reportService')>(
      '@/services/reportService',
    );
    window.sessionStorage.setItem(
      'orders:u_ana',
      JSON.stringify([{ id: 'ped-1', status: 'confirmado', store: { id: 's_1', name: 'Bia' } }]),
    );
    vi.mocked(reportOrder).mockImplementation(actual.reportOrder);
    try {
      await actual.reportOrder('ped-1', 'danificado', 'Primeira.');
      renderDialog();

      fireEvent.change(motivo(), { target: { value: 'nao_recebido' } });
      fireEvent.change(descricao(), { target: { value: 'Segunda.' } });
      enviar();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Este pedido já tem um problema reportado.',
      );
    } finally {
      window.sessionStorage.clear();
    }
  });
});
