import { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/context/ToastContext';
import {
  AdminReceiptError,
  approveReceipt,
  downloadReceipt,
  getReceiptReview,
  rejectReceipt,
} from '@/services/adminReceiptService';
import type { ReceiptReview } from '@/types/admin';
import { formatDateTime } from '@/utils/format';
import ReceiptReviewPanel from './ReceiptReviewPanel';

/**
 * Fixture de testes do painel de conferência (FE-US032-2). Só para testes:
 * `review({ orderId: '7', payment: { receiptType: 'pdf' } })`.
 */
function review(
  overrides: Partial<Omit<ReceiptReview, 'payment'>> & {
    payment?: Partial<ReceiptReview['payment']>;
  } = {},
): ReceiptReview {
  const { payment, ...rest } = overrides;
  return {
    orderId: '8921',
    buyer: { name: 'Ana Compradora', email: 'ana@exemplo.com' },
    store: { id: 's1', name: 'Brechó da Bia', sellerName: 'Bia Lopes', pixKey: 'bia@vintex.com' },
    items: [{ productId: '1', name: 'Jaqueta jeans', price: 159.9, coverImageUrl: null }],
    totalAmount: 159.9,
    platformFee: 14.39,
    sellerNetAmount: 145.51,
    ...rest,
    payment: {
      status: 'pendente',
      receiptUrl: '/api/admin/payments/8921/receipt',
      receiptType: 'image',
      submittedAt: '2026-10-01T10:00:00.000Z',
      ...payment,
    },
  };
}

vi.mock('@/services/adminReceiptService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/adminReceiptService')>()),
  approveReceipt: vi.fn(),
  rejectReceipt: vi.fn(),
  downloadReceipt: vi.fn(),
  getReceiptReview: vi.fn(),
}));

const approved = review({
  payment: {
    status: 'aprovado',
    validatedBy: { id: 'a1', name: 'Equipe Vintex' },
    validatedAt: '2026-10-01T14:32:00.000Z',
  },
});

const rejected = review({
  payment: {
    status: 'rejeitado',
    validatedBy: { id: 'a1', name: 'Equipe Vintex' },
    validatedAt: '2026-10-01T14:32:00.000Z',
    rejectionReason: 'Comprovante ilegível.',
  },
});

/** Faz o papel da fila: guarda o item e o troca quando o painel avisa. */
function Host({ initial, onUpdated }: { initial: ReceiptReview; onUpdated?: () => void }) {
  const [item, setItem] = useState(initial);
  return (
    <ReceiptReviewPanel
      item={item}
      onUpdated={(updated) => {
        onUpdated?.();
        setItem(updated);
      }}
    />
  );
}

function renderPanel(initial: ReceiptReview = review(), onUpdated?: () => void) {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <Host initial={initial} onUpdated={onUpdated} />
    </ToastProvider>,
  );
  return user;
}

beforeEach(() => {
  vi.mocked(downloadReceipt)
    .mockReset()
    .mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
  vi.mocked(approveReceipt).mockReset().mockResolvedValue(approved);
  vi.mocked(rejectReceipt).mockReset().mockResolvedValue(rejected);
  vi.mocked(getReceiptReview).mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:recibo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe('ReceiptReviewPanel', () => {
  it('mostra o pedido, o comprovante e os dados do pedido', async () => {
    renderPanel();

    expect(screen.getByRole('heading', { name: 'Pedido #8921' })).toBeInTheDocument();
    expect(screen.getByText(/Comprovante anexado há .+ · Comprador: Ana Compradora/)).toBeVisible();
    expect(screen.getByText('Pendente de validação')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Comprovante do pedido #8921' })).toHaveAttribute(
      'src',
      'blob:recibo',
    );
    expect(downloadReceipt).toHaveBeenCalledWith('8921');

    const rows = screen.getByRole('list', { name: 'Dados do pedido' });
    expect(within(rows).getByText('Ana Compradora')).toBeInTheDocument();
    expect(within(rows).getByText('Bia Lopes · Brechó da Bia')).toBeInTheDocument();
    expect(within(rows).getByText('Jaqueta jeans')).toBeInTheDocument();
    expect(within(rows).getByText('R$ 159,90')).toBeInTheDocument();
    expect(within(rows).getByText('Comissão Vintex (9%)')).toBeInTheDocument();
    expect(within(rows).getByText('R$ 14,39')).toBeInTheDocument();
    expect(within(rows).getByText('R$ 145,51')).toBeInTheDocument();
    expect(within(rows).getByText('bia@vintex.com')).toBeInTheDocument();
  });

  it('lista todas as peças e mostra "—" quando não há chave Pix nem nome do vendedor', () => {
    renderPanel(
      review({
        store: { id: 's1', name: 'Brechó da Bia', pixKey: null },
        items: [
          { productId: '1', name: 'Jaqueta jeans', price: 100, coverImageUrl: null },
          { productId: '2', name: 'Bolsa de couro', price: 59.9, coverImageUrl: null },
        ],
      }),
    );

    const rows = screen.getByRole('list', { name: 'Dados do pedido' });
    expect(within(rows).getByText('Jaqueta jeans, Bolsa de couro')).toBeInTheDocument();
    expect(within(rows).getByText('Brechó da Bia')).toBeInTheDocument();
    expect(within(rows).getByText('—')).toBeInTheDocument();
  });

  it('PDF abre em uma nova aba, a partir do Blob', async () => {
    vi.mocked(downloadReceipt).mockResolvedValue(new Blob(['x'], { type: 'application/pdf' }));
    renderPanel(review({ payment: { receiptType: 'pdf' } }));

    const link = await screen.findByRole('link', { name: /Abrir comprovante/ });
    expect(link).toHaveAttribute('href', 'blob:recibo');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('avisa que está carregando o comprovante', () => {
    vi.mocked(downloadReceipt).mockReturnValue(new Promise(() => {}));
    renderPanel();

    expect(screen.getByText('Carregando comprovante…')).toBeInTheDocument();
  });

  it('falha ao baixar o comprovante: avisa e deixa tentar de novo', async () => {
    vi.mocked(downloadReceipt).mockRejectedValueOnce(new Error('rede'));
    const user = renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar o comprovante.',
    );
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('img', { name: 'Comprovante do pedido #8921' })).toBeVisible();
    expect(downloadReceipt).toHaveBeenCalledTimes(2);
  });

  describe('aprovar', () => {
    it('pede confirmação e só então aprova (RN-22: mostra "Validado por … em …")', async () => {
      const onUpdated = vi.fn();
      const user = renderPanel(review(), onUpdated);

      await user.click(screen.getByRole('button', { name: /Aprovar pagamento/ }));
      expect(approveReceipt).not.toHaveBeenCalled();
      const dialog = screen.getByRole('dialog', { name: 'Aprovar pagamento?' });

      await user.click(within(dialog).getByRole('button', { name: 'Confirmar aprovação' }));

      expect(approveReceipt).toHaveBeenCalledWith('8921');
      expect(await screen.findByText(/Validado por Equipe Vintex em/)).toHaveTextContent(
        `Validado por Equipe Vintex em ${formatDateTime('2026-10-01T14:32:00.000Z')}`,
      );
      expect(onUpdated).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Aprovado')).toBeInTheDocument();
      expect(screen.getByText('Comprovante aprovado.')).toBeInTheDocument();
    });

    it('cancelar não envia e devolve o foco ao botão', async () => {
      const user = renderPanel();
      const button = screen.getByRole('button', { name: /Aprovar pagamento/ });

      await user.click(button);
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(approveReceipt).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(button).toHaveFocus();
    });

    it('com erro, mantém o diálogo aberto com a mensagem e deixa tentar de novo', async () => {
      vi.mocked(approveReceipt).mockRejectedValueOnce(new Error('rede'));
      const user = renderPanel();

      await user.click(screen.getByRole('button', { name: /Aprovar pagamento/ }));
      await user.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Não foi possível concluir a validação. Tente de novo.',
      );
      expect(screen.queryByText(/Validado por/)).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Confirmar aprovação' }));
      expect(await screen.findByText(/Validado por Equipe Vintex em/)).toBeInTheDocument();
    });

    it('desabilita os botões enquanto envia', async () => {
      let resolve!: (value: ReceiptReview) => void;
      vi.mocked(approveReceipt).mockReturnValue(new Promise((r) => (resolve = r)));
      const user = renderPanel();

      await user.click(screen.getByRole('button', { name: /Aprovar pagamento/ }));
      await user.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));

      expect(screen.getByRole('button', { name: 'Aprovando…' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Rejeitar comprovante/ })).toBeDisabled();

      resolve(approved);
      expect(await screen.findByText(/Validado por/)).toBeInTheDocument();
    });

    it('clicar no fundo enquanto envia não fecha o diálogo', async () => {
      let resolve!: (value: ReceiptReview) => void;
      vi.mocked(approveReceipt).mockReturnValue(new Promise((r) => (resolve = r)));
      const user = renderPanel();

      await user.click(screen.getByRole('button', { name: /Aprovar pagamento/ }));
      await user.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));
      await user.click(screen.getByTestId('dialog-backdrop'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      resolve(approved);
      expect(await screen.findByText(/Validado por/)).toBeInTheDocument();
    });

    it('409: outra pessoa já validou — mostra o registro dela, sem erro genérico', async () => {
      vi.mocked(approveReceipt).mockRejectedValueOnce(
        new AdminReceiptError('ALREADY_VALIDATED', 'já validado'),
      );
      vi.mocked(getReceiptReview).mockResolvedValue(rejected);
      const user = renderPanel();

      await user.click(screen.getByRole('button', { name: /Aprovar pagamento/ }));
      await user.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));

      expect(await screen.findByText(/Validado por Equipe Vintex em/)).toBeInTheDocument();
      expect(getReceiptReview).toHaveBeenCalledWith('8921');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Aprovar pagamento/ })).not.toBeInTheDocument();
    });
  });

  describe('rejeitar', () => {
    it('sem motivo não envia e mostra o erro (RN-23)', async () => {
      const user = renderPanel();

      await user.click(screen.getByRole('button', { name: /Rejeitar comprovante/ }));
      const dialog = screen.getByRole('dialog', { name: 'Rejeitar comprovante' });
      await user.click(within(dialog).getByRole('button', { name: 'Confirmar rejeição' }));

      expect(rejectReceipt).not.toHaveBeenCalled();
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Informe o motivo da rejeição.');
      expect(within(dialog).getByLabelText('Motivo da rejeição')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it('motivo só com espaços também não envia', async () => {
      const user = renderPanel();

      await user.click(screen.getByRole('button', { name: /Rejeitar comprovante/ }));
      await user.type(screen.getByLabelText('Motivo da rejeição'), '   ');
      await user.click(screen.getByRole('button', { name: 'Confirmar rejeição' }));

      expect(rejectReceipt).not.toHaveBeenCalled();
    });

    it('com motivo, rejeita e mostra o registro com o motivo', async () => {
      const user = renderPanel();

      await user.click(screen.getByRole('button', { name: /Rejeitar comprovante/ }));
      await user.type(screen.getByLabelText('Motivo da rejeição'), 'Comprovante ilegível.');
      await user.click(screen.getByRole('button', { name: 'Confirmar rejeição' }));

      expect(rejectReceipt).toHaveBeenCalledWith('8921', 'Comprovante ilegível.');
      expect(await screen.findByText(/Validado por Equipe Vintex em/)).toBeInTheDocument();
      expect(screen.getByText('Motivo: Comprovante ilegível.')).toBeInTheDocument();
      expect(screen.getByText('Rejeitado')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText('Comprovante rejeitado.')).toBeInTheDocument();
    });

    it('cancelar fecha sem enviar, limpa o texto e devolve o foco ao botão', async () => {
      const user = renderPanel();
      const button = screen.getByRole('button', { name: /Rejeitar comprovante/ });

      await user.click(button);
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
      await user.type(screen.getByLabelText('Motivo da rejeição'), 'algo');
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(rejectReceipt).not.toHaveBeenCalled();
      expect(button).toHaveFocus();

      await user.click(button);
      expect(screen.getByLabelText('Motivo da rejeição')).toHaveValue('');
    });

    it('com erro, mantém o diálogo aberto e o texto digitado', async () => {
      vi.mocked(rejectReceipt).mockRejectedValueOnce(
        new AdminReceiptError('FORBIDDEN', 'sem permissão'),
      );
      const user = renderPanel();

      await user.click(screen.getByRole('button', { name: /Rejeitar comprovante/ }));
      await user.type(screen.getByLabelText('Motivo da rejeição'), 'Valor errado.');
      await user.click(screen.getByRole('button', { name: 'Confirmar rejeição' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Você não tem permissão para validar comprovantes.',
      );
      expect(within(dialog).getByLabelText('Motivo da rejeição')).toHaveValue('Valor errado.');
    });

    it('digitar depois do erro de motivo tira o aviso', async () => {
      const user = renderPanel();

      await user.click(screen.getByRole('button', { name: /Rejeitar comprovante/ }));
      await user.click(screen.getByRole('button', { name: 'Confirmar rejeição' }));
      expect(screen.getByRole('alert')).toBeInTheDocument();

      await user.type(screen.getByLabelText('Motivo da rejeição'), 'a');
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    });

    it('enquanto envia, o botão do diálogo mostra "Rejeitando…" e fica desabilitado', async () => {
      let resolve!: (value: ReceiptReview) => void;
      vi.mocked(rejectReceipt).mockReturnValue(new Promise((r) => (resolve = r)));
      const user = renderPanel();

      await user.click(screen.getByRole('button', { name: /Rejeitar comprovante/ }));
      await user.type(screen.getByLabelText('Motivo da rejeição'), 'Valor errado.');
      await user.click(screen.getByRole('button', { name: 'Confirmar rejeição' }));

      expect(screen.getByRole('button', { name: 'Rejeitando…' })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Aprovar pagamento/ })).toBeDisabled();

      resolve(rejected);
      expect(await screen.findByText(/Validado por/)).toBeInTheDocument();
    });
  });

  describe('já validado', () => {
    it('aprovado: sem botões de ação, só o registro (RN-22)', () => {
      renderPanel(approved);

      expect(screen.getByText(/Validado por Equipe Vintex em/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Aprovar pagamento/ })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Rejeitar comprovante/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/^Motivo:/)).not.toBeInTheDocument();
    });

    it('rejeitado: sem botões de ação, com o registro e o motivo', () => {
      renderPanel(rejected);

      expect(screen.getByText(/Validado por Equipe Vintex em/)).toBeInTheDocument();
      expect(screen.getByText('Motivo: Comprovante ilegível.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Aprovar pagamento/ })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Rejeitar comprovante/ }),
      ).not.toBeInTheDocument();
    });

    it('sem quem validou no registro, não mostra a linha "Validado por"', () => {
      renderPanel(review({ payment: { status: 'aprovado' } }));

      expect(screen.queryByText(/Validado por/)).not.toBeInTheDocument();
    });
  });
});
