import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PixPaymentCard from './PixPaymentCard';

const PIX_KEY = 'pagamentos@brecho-exemplo.com.br';
const STORE_NAME = 'Brechó Exemplo';
const ORDER_LABEL = 'Pedido #123';
const MISSING_KEY_MESSAGE = 'Este brechó ainda não cadastrou a chave Pix';

let originalClipboardDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();

  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
  } else {
    Reflect.deleteProperty(navigator, 'clipboard');
  }
});

function renderCard(props: Partial<Parameters<typeof PixPaymentCard>[0]> = {}) {
  return render(
    <PixPaymentCard
      amount={198}
      pixKey={PIX_KEY}
      storeName={STORE_NAME}
      orderLabel={ORDER_LABEL}
      {...props}
    />,
  );
}

function setupClipboard() {
  // setup() fornece um stub de clipboard; o spy deve ser criado depois dele.
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

  return { user, writeText };
}

describe('<PixPaymentCard />', () => {
  it.each([
    { amount: 198, expected: 'R$ 198,00' },
    { amount: 198.5, expected: 'R$ 198,50' },
  ])('formata $amount reais como $expected', ({ amount, expected }) => {
    renderCard({ amount });

    expect(screen.getByText(expected, { exact: true })).toBeVisible();
  });

  it('renderiza a chave Pix integralmente como texto visível', () => {
    renderCard();

    expect(screen.getByText(PIX_KEY, { exact: true })).toBeVisible();
  });

  it('associa o nome do brechó ao rótulo Favorecido', () => {
    renderCard();

    const label = screen.getByText('Favorecido', { selector: 'dt', exact: true });
    const group = label.parentElement;
    if (!group) throw new Error('O favorecido precisa de um grupo de rótulo e valor.');

    expect(within(group).getByRole('definition')).toHaveTextContent(STORE_NAME);
  });

  it('renderiza o identificador do pedido', () => {
    renderCard();

    expect(screen.getByText(ORDER_LABEL, { exact: true })).toBeVisible();
  });

  it('apresenta um botão acessível Copiar chave quando a chave existe', () => {
    renderCard();

    expect(screen.getByRole('button', { name: 'Copiar chave' })).toBeVisible();
  });

  it('um clique copia exatamente a chave Pix uma única vez', async () => {
    const { user, writeText } = setupClipboard();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Copiar chave' }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(PIX_KEY);
  });

  it('chama onCopied uma única vez após copiar com sucesso', async () => {
    const { user, writeText } = setupClipboard();
    const onCopied = vi.fn();
    renderCard({ onCopied });

    await user.click(screen.getByRole('button', { name: 'Copiar chave' }));

    await waitFor(() => expect(onCopied).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('aguarda a resolução de writeText antes de chamar onCopied', async () => {
    const { user, writeText } = setupClipboard();
    const onCopied = vi.fn();
    let resolveCopy!: () => void;
    const copying = new Promise<void>((resolve) => {
      resolveCopy = resolve;
    });
    writeText.mockReturnValueOnce(copying);
    renderCard({ onCopied });

    await user.click(screen.getByRole('button', { name: 'Copiar chave' }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(onCopied).not.toHaveBeenCalled();

    await act(async () => {
      resolveCopy();
      await copying;
    });

    await waitFor(() => expect(onCopied).toHaveBeenCalledTimes(1));
  });

  it('copia sem erro quando onCopied não é fornecido', async () => {
    const { user, writeText } = setupClipboard();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Copiar chave' }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(PIX_KEY);
    expect(screen.getByText(PIX_KEY, { exact: true })).toBeVisible();
  });

  it('trata a rejeição do clipboard sem chamar onCopied nem esconder a chave', async () => {
    const { user, writeText } = setupClipboard();
    writeText.mockRejectedValueOnce(new Error('Acesso ao clipboard recusado'));
    const onCopied = vi.fn();
    renderCard({ onCopied });

    // Rejeições não tratadas são reportadas pelo próprio Vitest como erro da execução.
    await user.click(screen.getByRole('button', { name: 'Copiar chave' }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(PIX_KEY);
    expect(onCopied).not.toHaveBeenCalled();
    expect(screen.getByText(PIX_KEY, { exact: true })).toBeVisible();
  });

  it('mostra exatamente o aviso exigido quando a chave é null', () => {
    renderCard({ pixKey: null });

    expect(screen.getByText(MISSING_KEY_MESSAGE, { exact: true })).toBeVisible();
  });

  it('não apresenta botão Copiar chave quando a chave é null', () => {
    renderCard({ pixKey: null });

    expect(screen.queryByRole('button', { name: 'Copiar chave' })).not.toBeInTheDocument();
  });

  it('não acessa nem chama o clipboard quando a chave é null', () => {
    const { writeText } = setupClipboard();
    const clipboardAccess = vi.spyOn(navigator, 'clipboard', 'get');
    renderCard({ pixKey: null });

    expect(clipboardAccess).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it.each([PIX_KEY, null])('não menciona QR Code com pixKey=%s', (pixKey) => {
    const { container } = renderCard({ pixKey });

    expect(container).not.toHaveTextContent(/qr\s*code/i);
  });

  it('preserva a chave e não chama onCopied quando o clipboard está indisponível', async () => {
    const { user, writeText } = setupClipboard();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    const onCopied = vi.fn();
    renderCard({ onCopied });

    await user.click(screen.getByRole('button', { name: 'Copiar chave' }));

    expect(writeText).not.toHaveBeenCalled();
    expect(onCopied).not.toHaveBeenCalled();
    expect(screen.getByText(PIX_KEY, { exact: true })).toBeVisible();
  });
});
