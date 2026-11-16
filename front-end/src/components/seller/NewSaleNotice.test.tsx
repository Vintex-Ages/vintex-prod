import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationsContext, type NotificationsContextValue } from '@/context/useNotifications';
import type { Notification } from '@/types/notification';
import NewSaleNotice from './NewSaleNotice';

/**
 * Aviso de nova venda no painel do vendedor (FE-US036-3, #421). Aqui o contexto
 * é um dublê; o fluxo com o provider real (e o contador do sino) fica no teste
 * do `SellerAdmin`.
 */

function venda(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'venda-421',
    type: 'sale',
    productName: 'Jaqueta de couro 421',
    orderId: 'pedido-421',
    createdAt: '2026-10-21T15:00:00.000Z',
    isRead: false,
    ...overrides,
  };
}

function contexto(overrides: Partial<NotificationsContextValue> = {}): NotificationsContextValue {
  return {
    items: [],
    available: true,
    unreadCount: 0,
    loading: false,
    error: null,
    pendingIds: [],
    markingAll: false,
    retry: vi.fn(),
    refresh: vi.fn(),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    markAllAsRead: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderNotice(value: NotificationsContextValue, onShowSold = vi.fn()) {
  render(
    <NotificationsContext.Provider value={value}>
      <NewSaleNotice onShowSold={onShowSold} />
    </NotificationsContext.Provider>,
  );
  return { onShowSold };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const avisos = () => within(screen.getByRole('region', { name: 'Avisos de nova venda' }));

afterEach(cleanup);

describe('<NewSaleNotice />', () => {
  it('uma venda não lida vira um aviso com a peça, a data e o prazo simulado', () => {
    renderNotice(contexto({ items: [venda()], unreadCount: 1 }));

    const aviso = avisos().getByRole('article');
    expect(
      within(aviso).getByRole('heading', { name: 'Sua peça Jaqueta de couro 421 foi vendida' }),
    ).toBeInTheDocument();
    expect(within(aviso).getByText(/nova venda/i)).toBeInTheDocument();
    expect(aviso.querySelector('time')).toHaveAttribute('datetime', '2026-10-21T15:00:00.000Z');
    expect(within(aviso).getByText(/\d{2}\/\d{2}\/2026 às \d{2}:\d{2}/)).toBeInTheDocument();
    expect(within(aviso).getByText(/prazo de postagem/i)).toHaveTextContent(/simulad/i);
    expect(within(aviso).getByRole('button', { name: 'Ver vendidas' })).toBeInTheDocument();
    expect(
      within(aviso).getByRole('button', {
        name: 'Dispensar aviso da venda de Jaqueta de couro 421',
      }),
    ).toBeInTheDocument();
  });

  // Onde o Figma e o back divergem, vale o back: sem Pedido nem validação do Pix.
  it('não fala em pedido nem em validação do Pix, e não expõe o orderId', () => {
    const { container } = render(
      <NotificationsContext.Provider value={contexto({ items: [venda()] })}>
        <NewSaleNotice onShowSold={vi.fn()} />
      </NotificationsContext.Provider>,
    );

    expect(container.textContent).not.toMatch(/pedido|validação|pix/i);
    expect(container.innerHTML).not.toContain('pedido-421');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('várias vendas não lidas: um aviso por notificação', () => {
    renderNotice(
      contexto({
        items: [
          venda({ id: 'v1', productName: 'Saia midi' }),
          venda({ id: 'v2', productName: 'Bolsa baú' }),
          venda({ id: 'v3', productName: 'Bota Chelsea' }),
        ],
      }),
    );

    const lista = avisos().getAllByRole('article');
    expect(lista).toHaveLength(3);
    expect(lista[0]).toHaveTextContent('Sua peça Saia midi foi vendida');
    expect(lista[1]).toHaveTextContent('Sua peça Bolsa baú foi vendida');
    expect(lista[2]).toHaveTextContent('Sua peça Bota Chelsea foi vendida');
  });

  it('favorito, venda já lida e tipo desconhecido não viram aviso', () => {
    renderNotice(
      contexto({
        items: [
          venda({ id: 'v1', productName: 'Saia midi' }),
          venda({ id: 'v2', productName: 'Casaco lido', isRead: true }),
          { ...venda({ id: 'f1', productName: 'Bolsa favoritada' }), type: 'favorite' },
          { ...venda({ id: 'x1', productName: 'Peça estranha' }), type: 'price_drop' },
        ],
      }),
    );

    expect(avisos().getAllByRole('article')).toHaveLength(1);
    expect(screen.queryByText(/Casaco lido/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bolsa favoritada/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Peça estranha/)).not.toBeInTheDocument();
  });

  it.each([
    ['sem notificações', contexto()],
    [
      'só lidas e favoritos',
      contexto({ items: [venda({ isRead: true }), { ...venda({ id: 'f' }), type: 'favorite' }] }),
    ],
    ['carregando', contexto({ loading: true })],
    ['com erro na rota', contexto({ error: 'Não foi possível carregar as notificações.' })],
    ['integração indisponível', contexto({ available: false, items: [venda()] })],
  ])('%s: não renderiza nenhum bloco', (_caso, value) => {
    render(
      <NotificationsContext.Provider value={value}>
        <div data-testid="pai">
          <NewSaleNotice onShowSold={vi.fn()} />
        </div>
      </NotificationsContext.Provider>,
    );

    expect(screen.getByTestId('pai')).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('"Ver vendidas" pede a aba de vendidas ao painel', async () => {
    const user = userEvent.setup();
    const { onShowSold } = renderNotice(contexto({ items: [venda()] }));

    await user.click(screen.getByRole('button', { name: 'Ver vendidas' }));

    expect(onShowSold).toHaveBeenCalledTimes(1);
  });

  it('o "x" marca a notificação como lida pelo contexto', async () => {
    const user = userEvent.setup();
    const markAsRead = vi.fn().mockResolvedValue(undefined);
    renderNotice(contexto({ items: [venda()], markAsRead }));

    await user.click(
      screen.getByRole('button', { name: 'Dispensar aviso da venda de Jaqueta de couro 421' }),
    );

    expect(markAsRead).toHaveBeenCalledExactlyOnceWith('venda-421');
  });

  it('enquanto marca, o "x" fica desabilitado e não repete a chamada', async () => {
    const user = userEvent.setup();
    const request = deferred();
    const markAsRead = vi.fn().mockReturnValue(request.promise);
    renderNotice(contexto({ items: [venda()], markAsRead }));
    const fechar = screen.getByRole('button', {
      name: 'Dispensar aviso da venda de Jaqueta de couro 421',
    });

    await user.click(fechar);
    expect(fechar).toBeDisabled();
    await user.click(fechar);

    expect(markAsRead).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve());
  });

  // Decisão: na falha, o aviso fica (a venda segue não lida no back), com um
  // alerta dentro dele e o "x" liberado para tentar de novo.
  it('falha ao marcar como lida mantém o aviso, explica e deixa tentar de novo', async () => {
    const user = userEvent.setup();
    const markAsRead = vi
      .fn()
      .mockRejectedValueOnce(new Error('falhou'))
      .mockResolvedValueOnce(undefined);
    renderNotice(contexto({ items: [venda()], markAsRead }));
    const fechar = screen.getByRole('button', {
      name: 'Dispensar aviso da venda de Jaqueta de couro 421',
    });

    await user.click(fechar);

    const aviso = avisos().getByRole('article');
    expect(await within(aviso).findByRole('alert')).toHaveTextContent(
      'Não foi possível dispensar o aviso. Tente de novo.',
    );
    expect(fechar).toBeEnabled();

    await user.click(fechar);

    expect(markAsRead).toHaveBeenCalledTimes(2);
    expect(within(aviso).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('data inválida não quebra o aviso', () => {
    renderNotice(contexto({ items: [venda({ createdAt: 'não é data' })] }));

    expect(
      avisos().getByRole('heading', { name: 'Sua peça Jaqueta de couro 421 foi vendida' }),
    ).toBeInTheDocument();
    expect(avisos().getByRole('article').querySelector('time')).toBeNull();
  });

  it('não usa cor em hex cru', () => {
    const { container } = render(
      <NotificationsContext.Provider value={contexto({ items: [venda()] })}>
        <NewSaleNotice onShowSold={vi.fn()} />
      </NotificationsContext.Provider>,
    );

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(container.innerHTML).not.toMatch(/\bdark:/);
  });
});
