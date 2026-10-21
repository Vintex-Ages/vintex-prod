import type { ReactNode } from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
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
import { useReceiptReview } from './useReceiptReview';

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
    store: { id: 's1', name: 'Brechó da Bia', pixKey: 'bia@vintex.com' },
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

const validated = (status: 'aprovado' | 'rejeitado') =>
  review({
    payment: {
      status,
      validatedBy: { id: 'u_admin', name: 'Admin Vintex' },
      validatedAt: '2026-10-01T12:00:00.000Z',
    },
  });

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

function setup(item = review()) {
  const onUpdated = vi.fn();
  const hook = renderHook(() => useReceiptReview(item, onUpdated), { wrapper });
  return { ...hook, onUpdated };
}

beforeEach(() => {
  vi.mocked(downloadReceipt)
    .mockReset()
    .mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
  vi.mocked(approveReceipt).mockReset().mockResolvedValue(validated('aprovado'));
  vi.mocked(rejectReceipt).mockReset().mockResolvedValue(validated('rejeitado'));
  vi.mocked(getReceiptReview).mockReset().mockResolvedValue(validated('aprovado'));
  URL.createObjectURL = vi.fn(() => 'blob:comprovante');
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe('useReceiptReview — arquivo do comprovante', () => {
  // Critério de aceite: baixa pelo httpClient (service) como Blob e mostra por object URL.
  it('baixa o comprovante do Pedido e expõe a object URL com o tipo do arquivo', async () => {
    const { result } = setup(review({ payment: { receiptType: 'pdf' } }));

    expect(result.current.file).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.file.status).toBe('ready'));

    expect(downloadReceipt).toHaveBeenCalledWith('8921');
    expect(result.current.file).toEqual({ status: 'ready', url: 'blob:comprovante', type: 'pdf' });
  });

  it('libera a object URL ao sair', async () => {
    const { result, unmount } = setup();
    await waitFor(() => expect(result.current.file.status).toBe('ready'));

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comprovante');
  });

  it('falha ao baixar vira erro e "tentar de novo" baixa outra vez', async () => {
    vi.mocked(downloadReceipt).mockRejectedValueOnce(new Error('rede'));
    const { result } = setup();
    await waitFor(() => expect(result.current.file.status).toBe('error'));

    act(() => result.current.retryFile());
    expect(result.current.file.status).toBe('loading');
    await waitFor(() => expect(result.current.file.status).toBe('ready'));

    expect(downloadReceipt).toHaveBeenCalledTimes(2);
  });

  it('descarta o arquivo de uma consulta que ficou velha', async () => {
    let resolveFirst: (blob: Blob) => void = () => {};
    vi.mocked(downloadReceipt).mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const { unmount } = setup();

    unmount();
    await act(async () => resolveFirst(new Blob(['x'])));

    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('descarta o erro de uma consulta que ficou velha', async () => {
    let rejectFirst: (error: Error) => void = () => {};
    vi.mocked(downloadReceipt).mockReturnValueOnce(
      new Promise<Blob>((_resolve, reject) => {
        rejectFirst = reject;
      }),
    );
    const { result, unmount } = setup();

    unmount();
    await act(async () => rejectFirst(new Error('rede')));

    expect(result.current.file).toEqual({ status: 'loading' });
  });
});

describe('useReceiptReview — aprovar', () => {
  it('chama approveReceipt, avisa a fila e mostra o Toast de sucesso', async () => {
    const { result, onUpdated } = setup();

    let ok = false;
    await act(async () => {
      ok = await result.current.approve();
    });

    expect(ok).toBe(true);
    expect(approveReceipt).toHaveBeenCalledWith('8921');
    expect(onUpdated).toHaveBeenCalledWith(validated('aprovado'));
    expect(result.current.submitting).toBeNull();
  });

  it('mostra o Toast de sucesso', async () => {
    function Probe() {
      const { approve } = useReceiptReview(review(), () => {});
      return (
        <button type="button" onClick={() => void approve()}>
          aprovar
        </button>
      );
    }
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );

    await act(async () => screen.getByRole('button', { name: 'aprovar' }).click());

    expect(await screen.findByText('Comprovante aprovado.')).toBeInTheDocument();
  });

  // Critério de aceite: botões desabilitados durante o envio.
  it('fica "aprovando" enquanto envia e ignora um segundo clique', async () => {
    let finish: (value: ReceiptReview) => void = () => {};
    vi.mocked(approveReceipt).mockReturnValueOnce(
      new Promise<ReceiptReview>((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = setup();

    let first: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = result.current.approve();
    });
    expect(result.current.submitting).toBe('approve');

    let second = true;
    await act(async () => {
      second = await result.current.approve();
    });
    expect(second).toBe(false);

    await act(async () => {
      finish(validated('aprovado'));
      await first;
    });
    expect(approveReceipt).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBeNull();
  });

  // Critério de aceite: erro mantém o painel aberto (não avisa a fila) e mostra mensagem.
  it('erro genérico guarda a mensagem, não avisa a fila e devolve false', async () => {
    vi.mocked(approveReceipt).mockRejectedValueOnce(
      new AdminReceiptError('INTERNAL_ERROR', 'Erro ao validar comprovante.'),
    );
    const { result, onUpdated } = setup();

    let ok = true;
    await act(async () => {
      ok = await result.current.approve();
    });

    expect(ok).toBe(false);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(result.current.actionError).toBe(
      'Não foi possível concluir a validação. Tente de novo.',
    );
    expect(result.current.submitting).toBeNull();
  });

  it('403 mostra a mensagem de sem permissão', async () => {
    vi.mocked(approveReceipt).mockRejectedValueOnce(
      new AdminReceiptError('FORBIDDEN', 'Proibido.'),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.approve();
    });

    expect(result.current.actionError).toBe('Você não tem permissão para validar comprovantes.');
  });

  it('clearErrors apaga a mensagem de erro', async () => {
    vi.mocked(approveReceipt).mockRejectedValueOnce(new Error('rede'));
    const { result } = setup();
    await act(async () => {
      await result.current.approve();
    });
    expect(result.current.actionError).not.toBeNull();

    act(() => result.current.clearErrors());

    expect(result.current.actionError).toBeNull();
  });
});

describe('useReceiptReview — rejeitar', () => {
  // Teste declarado na issue — RN-23 exige motivo.
  it('sem motivo não envia e pede o motivo', async () => {
    const { result, onUpdated } = setup();

    let ok = true;
    await act(async () => {
      ok = await result.current.reject('   ');
    });

    expect(ok).toBe(false);
    expect(rejectReceipt).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
    expect(result.current.reasonError).toBe('Informe o motivo da rejeição.');
  });

  it('com motivo chama rejectReceipt com o motivo aparado e avisa a fila', async () => {
    const { result, onUpdated } = setup();

    let ok = false;
    await act(async () => {
      ok = await result.current.reject('  Comprovante ilegível.  ');
    });

    expect(ok).toBe(true);
    expect(rejectReceipt).toHaveBeenCalledWith('8921', 'Comprovante ilegível.');
    expect(onUpdated).toHaveBeenCalledWith(validated('rejeitado'));
    expect(result.current.reasonError).toBeNull();
  });

  it('erro ao rejeitar guarda a mensagem e devolve false', async () => {
    vi.mocked(rejectReceipt).mockRejectedValueOnce(new Error('rede'));
    const { result, onUpdated } = setup();

    let ok = true;
    await act(async () => {
      ok = await result.current.reject('Ilegível.');
    });

    expect(ok).toBe(false);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(result.current.actionError).toBe(
      'Não foi possível concluir a validação. Tente de novo.',
    );
  });

  it('ignora um segundo envio enquanto o primeiro não terminou', async () => {
    let finish: (value: ReceiptReview) => void = () => {};
    vi.mocked(rejectReceipt).mockReturnValueOnce(
      new Promise<ReceiptReview>((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = setup();

    let first: Promise<boolean> = Promise.resolve(false);
    act(() => {
      first = result.current.reject('Ilegível.');
    });
    expect(result.current.submitting).toBe('reject');
    await act(async () => {
      await result.current.reject('Ilegível.');
    });

    await act(async () => {
      finish(validated('rejeitado'));
      await first;
    });
    expect(rejectReceipt).toHaveBeenCalledTimes(1);
  });
});

describe('useReceiptReview — 409 (outra pessoa já validou)', () => {
  // Critério de aceite: recarrega o item e mostra o registro, sem erro genérico.
  it('aprovar com 409 relê o item, avisa a fila e não mostra erro', async () => {
    vi.mocked(approveReceipt).mockRejectedValueOnce(
      new AdminReceiptError('ORDER_NOT_IN_REVIEW', 'Já validado.'),
    );
    const { result, onUpdated } = setup();

    let ok = false;
    await act(async () => {
      ok = await result.current.approve();
    });

    expect(ok).toBe(true);
    expect(getReceiptReview).toHaveBeenCalledWith('8921');
    expect(onUpdated).toHaveBeenCalledWith(validated('aprovado'));
    expect(result.current.actionError).toBeNull();
  });

  it('rejeitar com 409 também relê o item', async () => {
    vi.mocked(rejectReceipt).mockRejectedValueOnce(
      new AdminReceiptError('ORDER_NOT_IN_REVIEW', 'Já validado.'),
    );
    const { result, onUpdated } = setup();

    await act(async () => {
      await result.current.reject('Ilegível.');
    });

    expect(getReceiptReview).toHaveBeenCalledWith('8921');
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('se não der para reler o item, mostra o erro', async () => {
    vi.mocked(approveReceipt).mockRejectedValueOnce(
      new AdminReceiptError('ORDER_NOT_IN_REVIEW', 'Já validado.'),
    );
    vi.mocked(getReceiptReview).mockRejectedValueOnce(new Error('rede'));
    const { result, onUpdated } = setup();

    let ok = true;
    await act(async () => {
      ok = await result.current.approve();
    });

    expect(ok).toBe(false);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(result.current.actionError).toBe(
      'Não foi possível concluir a validação. Tente de novo.',
    );
  });
});
