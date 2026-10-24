import { useState } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationBell from './NotificationBell';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { useNotifications } from '@/context/useNotifications';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { listNotifications, markAsRead, markAllAsRead } from '@/services/notificationService';
import { paths, productDetail } from '@/routes/paths';
import type { AuthUser } from '@/types/auth';
import type { Notification } from '@/types/notification';

vi.mock('@/services/notificationService', () => ({
  listNotifications: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  countUnread: (items: Notification[]) => items.filter((item) => !item.isRead).length,
}));

const USER: AuthUser = {
  id: 'usuario-sino-341',
  name: 'Pessoa Fictícia',
  email: 'pessoa@example.invalid',
  is_seller: true,
  is_admin: false,
};
const OTHER_USER: AuthUser = { ...USER, id: 'outro-usuario-sino-341' };
const INITIAL_PATH = '/catalog';
const FAVORITE_MESSAGE = 'Alguém favoritou sua peça Bolsa fictícia 341';
const SALE_MESSAGE = 'Sua peça Jaqueta fictícia 341 foi vendida';

function fixtures(): Notification[] {
  return [
    {
      id: 'favorito-341',
      type: 'favorite',
      recipientUserId: USER.id,
      productId: 'produto-favorito-341',
      productName: 'Bolsa fictícia 341',
      createdAt: '2026-10-21T15:00:00.000Z',
      isRead: false,
    },
    {
      id: 'venda-341',
      type: 'sale',
      recipientUserId: USER.id,
      productName: 'Jaqueta fictícia 341',
      createdAt: '2026-10-20T15:00:00.000Z',
      isRead: false,
    },
    {
      id: 'venda-lida-341',
      type: 'sale',
      recipientUserId: USER.id,
      productName: 'Casaco fictício 341',
      createdAt: '2026-10-19T15:00:00.000Z',
      isRead: true,
    },
  ];
}

let notifications: Notification[];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function session(user: AuthUser | null): AuthContextValue {
  return {
    user,
    token: user ? 'token-ficticio-sino' : null,
    isAuthenticated: user !== null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
  };
}

function ControlledBell() {
  const [open, setOpen] = useState(false);
  return (
    <NotificationBell
      open={open}
      onToggle={() => setOpen((value) => !value)}
      onClose={() => setOpen(false)}
    />
  );
}

function StateProbe() {
  const { unreadCount } = useNotifications();
  const location = useLocation();
  return (
    <>
      <output aria-label="Não lidas no estado">{unreadCount}</output>
      <output aria-label="Rota atual">{location.pathname}</output>
    </>
  );
}

function BellHarness() {
  const [user, setUser] = useState<AuthUser | null>(USER);
  return (
    <AuthContext.Provider value={session(user)}>
      <NotificationsProvider>
        {user && <ControlledBell />}
        <StateProbe />
        <button type="button" onClick={() => setUser(null)}>
          Encerrar sessão
        </button>
        <button type="button" onClick={() => setUser(OTHER_USER)}>
          Trocar usuário
        </button>
      </NotificationsProvider>
    </AuthContext.Provider>
  );
}

function renderBell() {
  return render(
    <MemoryRouter initialEntries={[INITIAL_PATH]}>
      <BellHarness />
    </MemoryRouter>,
  );
}

async function openPanel(user = userEvent.setup()) {
  await user.click(screen.getByRole('button', { name: 'Notificações' }));
  return screen.findByRole('region', { name: 'Notificações' });
}

function findMessage(panel: HTMLElement, message: string) {
  return within(panel).findByRole('button', { name: new RegExp(message, 'i') });
}

function notificationButton(message: string) {
  return screen.getByRole('button', { name: new RegExp(message, 'i') });
}

beforeEach(() => {
  notifications = fixtures();
  vi.mocked(listNotifications)
    .mockReset()
    .mockImplementation(async (userId) =>
      userId === USER.id
        ? structuredClone(notifications)
        : [
            {
              ...fixtures()[0],
              id: 'favorito-exclusivo-b',
              recipientUserId: userId,
              productName: 'Peça exclusiva B',
            },
          ],
    );
  vi.mocked(markAsRead)
    .mockReset()
    .mockImplementation(async (_userId, id) => {
      const item = notifications.find((entry) => entry.id === id);
      if (!item) throw new Error('Notificação inexistente');
      return { ...item, isRead: true };
    });
  vi.mocked(markAllAsRead)
    .mockReset()
    .mockImplementation(async () => notifications.map((item) => ({ ...item, isRead: true })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('NotificationBell — painel e acessibilidade', () => {
  it('inicia recolhido com botão semântico chamado Notificações', () => {
    renderBell();

    const bell = screen.getByRole('button', { name: 'Notificações' });
    expect(bell.tagName).toBe('BUTTON');
    expect(bell).toHaveAttribute('type', 'button');
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Notificações' })).not.toBeInTheDocument();
  });

  it('clique abre o painel e associa aria-controls ao conteúdo nomeado', async () => {
    renderBell();
    const panel = await openPanel();

    const bell = screen.getByRole('button', { name: 'Notificações' });
    expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(bell).toHaveAttribute('aria-controls');
    expect(document.getElementById(bell.getAttribute('aria-controls') ?? '')).toBe(panel);
    expect(within(panel).getByRole('heading', { name: 'Notificações' })).toBeInTheDocument();
  });

  it('clicar novamente no sino fecha o painel', async () => {
    const user = userEvent.setup();
    renderBell();
    await openPanel(user);

    await user.click(screen.getByRole('button', { name: 'Notificações' }));

    expect(screen.queryByRole('region', { name: 'Notificações' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notificações' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('exibe lista semântica da mais recente para a mais antiga', async () => {
    renderBell();
    const panel = await openPanel();
    await findMessage(panel, FAVORITE_MESSAGE);

    const items = within(panel).getAllByRole('listitem');
    expect(within(panel).getByRole('list')).toBeInTheDocument();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(FAVORITE_MESSAGE);
    expect(items[1]).toHaveTextContent(SALE_MESSAGE);
    expect(items[2]).toHaveTextContent('Sua peça Casaco fictício 341 foi vendida');
  });

  it('exibe as duas mensagens exigidas com o nome da peça correspondente', async () => {
    renderBell();
    const panel = await openPanel();

    expect(await findMessage(panel, FAVORITE_MESSAGE)).toBeInTheDocument();
    expect(notificationButton(SALE_MESSAGE)).toBeInTheDocument();
    expect(
      within(panel).queryByText('Sua peça Bolsa fictícia 341 foi vendida'),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByText('Alguém favoritou sua peça Jaqueta fictícia 341'),
    ).not.toBeInTheDocument();
  });

  it('renderiza cada data em time com datetime ISO e conteúdo legível', async () => {
    renderBell();
    const panel = await openPanel();
    await findMessage(panel, FAVORITE_MESSAGE);

    const times = panel.querySelectorAll('time');
    expect(times).toHaveLength(3);
    notifications.forEach((item, index) => {
      expect(times[index]).toHaveAttribute('datetime', item.createdAt);
      expect(times[index]).toHaveTextContent(/\d/);
    });
  });

  it('indica textualmente as duas não lidas sem marcar a já lida', async () => {
    renderBell();
    const panel = await openPanel();
    await findMessage(panel, FAVORITE_MESSAGE);

    expect(within(panel).getAllByText('Não lida', { exact: true })).toHaveLength(2);
  });

  it('mostra estado vazio e mantém ação de lote desabilitada', async () => {
    notifications = [];
    renderBell();
    const panel = await openPanel();

    expect(await within(panel).findByText(/nenhuma notificação/i)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Marcar todas como lidas' })).toBeDisabled();
  });

  it('mostra loading enquanto a lista está pendente', async () => {
    const request = deferred<Notification[]>();
    vi.mocked(listNotifications).mockReturnValue(request.promise);
    renderBell();
    const panel = await openPanel();

    expect(within(panel).getByRole('status')).toHaveTextContent(/carregando/i);
    expect(within(panel).queryAllByRole('listitem')).toHaveLength(0);
    await act(async () => request.resolve(fixtures()));
  });

  it('falha de carregamento mostra erro e retry recupera a lista', async () => {
    const user = userEvent.setup();
    vi.mocked(listNotifications).mockRejectedValueOnce(new Error('Falha controlada'));
    renderBell();
    const panel = await openPanel(user);
    expect(await within(panel).findByRole('alert')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: /tentar (de novo|novamente)/i }));

    expect(await findMessage(panel, FAVORITE_MESSAGE)).toBeInTheDocument();
    expect(listNotifications).toHaveBeenCalledTimes(2);
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('preserva nomes extensos integralmente', async () => {
    const longName =
      'Jaqueta fictícia de coleção especial com bordados e nome extenso para verificar conteúdo acessível';
    notifications = [{ ...fixtures()[0], productName: longName }];
    renderBell();
    const panel = await openPanel();

    expect(await findMessage(panel, `Alguém favoritou sua peça ${longName}`)).toBeInTheDocument();
  });

  it('não inventa um prazo numérico de postagem para a venda', async () => {
    renderBell();
    const panel = await openPanel();
    await findMessage(panel, SALE_MESSAGE);

    expect(within(panel).queryByText(/\b\d+\s*dias?\b/i)).not.toBeInTheDocument();
  });

  it.each([
    { keyName: 'Enter', keys: '{Enter}' },
    { keyName: 'Espaço', keys: ' ' },
  ])('sino é acionável por $keyName e recebe foco', async ({ keys }) => {
    const user = userEvent.setup();
    renderBell();
    await user.tab();
    const bell = screen.getByRole('button', { name: 'Notificações' });
    expect(bell).toHaveFocus();

    await user.keyboard(keys);

    expect(screen.getByRole('region', { name: 'Notificações' })).toBeInTheDocument();
    expect(bell).toHaveAttribute('aria-expanded', 'true');
  });

  it('Escape fecha e devolve foco ao sino', async () => {
    const user = userEvent.setup();
    renderBell();
    await openPanel(user);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('region', { name: 'Notificações' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notificações' })).toHaveFocus();
  });

  it('não utiliza semântica ARIA de menu para a lista interativa', async () => {
    renderBell();
    await openPanel();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('lista longa mantém a última notificação acessível pelo teclado', async () => {
    notifications = Array.from({ length: 60 }, (_, index) => ({
      ...fixtures()[0],
      id: `notificacao-longa-${index}`,
      productName: `Peça fictícia da lista ${index}`,
    }));
    const user = userEvent.setup();
    renderBell();
    const panel = await openPanel(user);
    await waitFor(() => expect(within(panel).getAllByRole('listitem')).toHaveLength(60));
    const last = notificationButton('Alguém favoritou sua peça Peça fictícia da lista 59');
    last.focus();
    expect(last).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(markAsRead).toHaveBeenCalledExactlyOnceWith(USER.id, 'notificacao-longa-59');
  });
});

describe('NotificationBell — leitura e navegação confirmadas', () => {
  it('favorito confirma leitura antes de atualizar, fechar e navegar à peça', async () => {
    const user = userEvent.setup();
    const request = deferred<Notification>();
    vi.mocked(markAsRead).mockReturnValue(request.promise);
    renderBell();
    const panel = await openPanel(user);
    await findMessage(panel, FAVORITE_MESSAGE);

    await user.click(notificationButton(FAVORITE_MESSAGE));

    expect(markAsRead).toHaveBeenCalledExactlyOnceWith(USER.id, 'favorito-341');
    expect(screen.getByLabelText('Não lidas no estado')).toHaveTextContent('2');
    expect(screen.getByLabelText('Rota atual')).toHaveTextContent(INITIAL_PATH);
    expect(panel).toBeInTheDocument();
    await act(async () => request.resolve({ ...fixtures()[0], isRead: true }));
    expect(screen.getByLabelText('Não lidas no estado')).toHaveTextContent('1');
    expect(screen.getByLabelText('Rota atual')).toHaveTextContent(
      productDetail('produto-favorito-341'),
    );
    expect(screen.queryByRole('region', { name: 'Notificações' })).not.toBeInTheDocument();
    const reopened = await openPanel(user);
    expect(within(reopened).getAllByText('Não lida', { exact: true })).toHaveLength(1);
  });

  it('venda sem productId navega para /seller e nunca para pedido do comprador', async () => {
    const user = userEvent.setup();
    renderBell();
    const panel = await openPanel(user);
    await findMessage(panel, SALE_MESSAGE);

    await user.click(notificationButton(SALE_MESSAGE));

    expect(markAsRead).toHaveBeenCalledExactlyOnceWith(USER.id, 'venda-341');
    await waitFor(() =>
      expect(screen.getByLabelText('Rota atual')).toHaveTextContent(paths.seller),
    );
    expect(screen.getByLabelText('Rota atual')).not.toHaveTextContent(paths.orders);
  });

  it('notificação já lida navega sem marcar de novo', async () => {
    const user = userEvent.setup();
    renderBell();
    const panel = await openPanel(user);
    await findMessage(panel, 'Sua peça Casaco fictício 341 foi vendida');

    await user.click(notificationButton('Sua peça Casaco fictício 341 foi vendida'));

    expect(markAsRead).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Rota atual')).toHaveTextContent(paths.seller);
    expect(screen.queryByRole('region', { name: 'Notificações' })).not.toBeInTheDocument();
  });

  it('não duplica leitura enquanto a primeira operação está pendente', async () => {
    const user = userEvent.setup();
    const request = deferred<Notification>();
    vi.mocked(markAsRead).mockReturnValue(request.promise);
    renderBell();
    const panel = await openPanel(user);
    await findMessage(panel, FAVORITE_MESSAGE);
    const button = notificationButton(FAVORITE_MESSAGE);

    await user.click(button);
    expect(button).toBeDisabled();
    await user.click(button);

    expect(markAsRead).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve({ ...fixtures()[0], isRead: true }));
  });

  it('falha individual preserva não lida, contador e rota, permitindo nova tentativa', async () => {
    const user = userEvent.setup();
    vi.mocked(markAsRead).mockRejectedValueOnce(new Error('Falha controlada'));
    renderBell();
    const panel = await openPanel(user);
    await findMessage(panel, FAVORITE_MESSAGE);

    await user.click(notificationButton(FAVORITE_MESSAGE));

    expect(await within(panel).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Não lidas no estado')).toHaveTextContent('2');
    expect(screen.getByLabelText('Rota atual')).toHaveTextContent(INITIAL_PATH);
    expect(within(panel).getAllByText('Não lida', { exact: true })).toHaveLength(2);
    const button = notificationButton(FAVORITE_MESSAGE);
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() =>
      expect(screen.getByLabelText('Rota atual')).toHaveTextContent(
        productDetail('produto-favorito-341'),
      ),
    );
  });

  it('marca todas em lote, remove badge e mantém a lista com itens lidos', async () => {
    const user = userEvent.setup();
    renderBell();
    const panel = await openPanel(user);
    await findMessage(panel, FAVORITE_MESSAGE);

    await user.click(within(panel).getByRole('button', { name: 'Marcar todas como lidas' }));

    expect(markAllAsRead).toHaveBeenCalledExactlyOnceWith(USER.id);
    expect(markAsRead).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText('Não lidas no estado')).toHaveTextContent('0'),
    );
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3);
    expect(within(panel).queryByText('Não lida', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notificações' })).toHaveAccessibleDescription(
      /0 notificações não lidas/i,
    );
    expect(screen.queryByText('2', { exact: true })).not.toBeInTheDocument();
  });

  it('lote pendente não zera antecipadamente nem dispara operações repetidas', async () => {
    const user = userEvent.setup();
    const request = deferred<Notification[]>();
    vi.mocked(markAllAsRead).mockReturnValue(request.promise);
    renderBell();
    const panel = await openPanel(user);
    await findMessage(panel, FAVORITE_MESSAGE);
    const button = within(panel).getByRole('button', { name: 'Marcar todas como lidas' });

    await user.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByLabelText('Não lidas no estado')).toHaveTextContent('2');
    await user.click(button);

    expect(markAllAsRead).toHaveBeenCalledTimes(1);
    expect(markAsRead).not.toHaveBeenCalled();
    await act(async () => request.resolve(fixtures().map((item) => ({ ...item, isRead: true }))));
    expect(screen.getByLabelText('Não lidas no estado')).toHaveTextContent('0');
  });

  it('falha do lote preserva os estados e permite repetir a operação', async () => {
    const user = userEvent.setup();
    vi.mocked(markAllAsRead).mockRejectedValueOnce(new Error('Falha do lote'));
    renderBell();
    const panel = await openPanel(user);
    await findMessage(panel, FAVORITE_MESSAGE);
    const button = within(panel).getByRole('button', { name: 'Marcar todas como lidas' });

    await user.click(button);

    expect(await within(panel).findByRole('alert')).toBeInTheDocument();
    expect(within(panel).getAllByText('Não lida', { exact: true })).toHaveLength(2);
    expect(screen.getByLabelText('Não lidas no estado')).toHaveTextContent('2');
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() =>
      expect(screen.getByLabelText('Não lidas no estado')).toHaveTextContent('0'),
    );
  });

  it('desabilita marcar todas quando todas já estão lidas', async () => {
    notifications = fixtures().map((item) => ({ ...item, isRead: true }));
    const user = userEvent.setup();
    renderBell();
    const panel = await openPanel(user);
    await findMessage(panel, FAVORITE_MESSAGE);
    const button = within(panel).getByRole('button', { name: 'Marcar todas como lidas' });

    expect(button).toBeDisabled();
    await user.click(button);

    expect(markAllAsRead).not.toHaveBeenCalled();
  });

  it('ler a última não lida remove o contador sem reload', async () => {
    notifications = [fixtures()[0]];
    const user = userEvent.setup();
    renderBell();
    const panel = await openPanel(user);
    await findMessage(panel, FAVORITE_MESSAGE);

    await user.click(notificationButton(FAVORITE_MESSAGE));

    await waitFor(() =>
      expect(screen.getByLabelText('Não lidas no estado')).toHaveTextContent('0'),
    );
    expect(screen.queryByText('1', { exact: true })).not.toBeInTheDocument();
  });

  it.each(['logout', 'troca de usuário'] as const)(
    'confirmação atrasada após %s não navega nem restaura o conteúdo anterior',
    async (change) => {
      const user = userEvent.setup();
      const request = deferred<Notification>();
      vi.mocked(markAsRead).mockReturnValue(request.promise);
      renderBell();
      const panel = await openPanel(user);
      await findMessage(panel, FAVORITE_MESSAGE);
      await user.click(notificationButton(FAVORITE_MESSAGE));
      await user.click(
        screen.getByRole('button', {
          name: change === 'logout' ? 'Encerrar sessão' : 'Trocar usuário',
        }),
      );

      await act(async () => request.resolve({ ...fixtures()[0], isRead: true }));

      expect(screen.getByLabelText('Rota atual')).toHaveTextContent(INITIAL_PATH);
      expect(
        screen.queryByRole('button', { name: new RegExp(FAVORITE_MESSAGE, 'i') }),
      ).not.toBeInTheDocument();
      if (change === 'logout') {
        expect(screen.queryByRole('button', { name: 'Notificações' })).not.toBeInTheDocument();
      }
    },
  );
});
