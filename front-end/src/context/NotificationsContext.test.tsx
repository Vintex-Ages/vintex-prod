import { StrictMode, useState, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthContext';
import { NotificationsProvider } from './NotificationsContext';
import { useNotifications } from './useNotifications';
import {
  AUTH_TOKEN_STORAGE_KEY,
  AUTH_USER_STORAGE_KEY,
  AuthContext,
  type AuthContextValue,
} from './useAuth';
import { listNotifications, markAsRead, markAllAsRead } from '@/services/notificationService';
import { handleAuthRequired } from '@/services/httpClient';
import type { AuthUser } from '@/types/auth';
import type { Notification } from '@/types/notification';

vi.mock('@/services/notificationService', () => ({
  listNotifications: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  countUnread: (items: Notification[]) => items.filter((item) => !item.isRead).length,
}));

const USER_A: AuthUser = {
  id: 'usuario-contexto-a',
  name: 'Pessoa Fictícia A',
  email: 'pessoa-a@example.invalid',
  is_seller: true,
  is_admin: false,
};
const USER_B: AuthUser = { ...USER_A, id: 'usuario-contexto-b', name: 'Pessoa Fictícia B' };

function itemsFor(userId: string): Notification[] {
  return [
    {
      id: `${userId}-favorito`,
      recipientUserId: userId,
      type: 'favorite',
      productId: 'produto-contexto-favorito',
      productName: `Bolsa de ${userId}`,
      createdAt: '2026-10-21T15:00:00.000Z',
      isRead: false,
    },
    {
      id: `${userId}-venda`,
      recipientUserId: userId,
      type: 'sale',
      productName: `Casaco de ${userId}`,
      createdAt: '2026-10-20T15:00:00.000Z',
      isRead: false,
    },
  ];
}

function session(user: AuthUser | null, loading = false): AuthContextValue {
  return {
    user,
    token: user ? `token-ficticio-${user.id}` : null,
    isAuthenticated: user !== null,
    loading,
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function Consumer({ name = 'principal' }: { name?: string }) {
  const {
    items,
    unreadCount,
    loading,
    error,
    retry,
    markAsRead,
    markAllAsRead,
    pendingIds,
    markingAll,
  } = useNotifications();
  const [operationError, setOperationError] = useState(false);
  return (
    <section aria-label={`Consumidor ${name}`}>
      <p role="status" aria-label={`Consulta ${name}`}>
        {loading ? 'Carregando notificações' : 'Consulta encerrada'}
      </p>
      <output aria-label={`Não lidas ${name}`}>{unreadCount}</output>
      {error && <p role="alert">Erro ao carregar notificações</p>}
      {operationError && <p role="alert">Leitura não confirmada</p>}
      <button type="button" onClick={retry}>
        Tentar novamente {name}
      </button>
      <button
        type="button"
        disabled={markingAll || pendingIds.length > 0 || unreadCount === 0}
        onClick={() => {
          setOperationError(false);
          void markAllAsRead().catch(() => setOperationError(true));
        }}
      >
        Ler todas {name}
      </button>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.productName}</span>
            <span>{item.isRead ? 'Lida' : 'Não lida'}</span>
            <button
              type="button"
              disabled={markingAll || pendingIds.includes(item.id)}
              onClick={() => {
                setOperationError(false);
                void markAsRead(item.id).catch(() => setOperationError(true));
              }}
            >
              Ler {item.id} {name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function tree(user: AuthUser | null, loading = false, children: ReactNode = <Consumer />) {
  return (
    <AuthContext.Provider value={session(user, loading)}>
      <NotificationsProvider>{children}</NotificationsProvider>
    </AuthContext.Provider>
  );
}

function PathProbe() {
  return <output aria-label="Rota atual">{useLocation().pathname}</output>;
}

beforeEach(() => {
  vi.mocked(listNotifications)
    .mockReset()
    .mockImplementation(async (userId) => itemsFor(userId));
  vi.mocked(markAsRead)
    .mockReset()
    .mockImplementation(async (userId, id) => {
      const item = itemsFor(userId).find((entry) => entry.id === id);
      if (!item) throw new Error('Notificação não encontrada');
      return { ...item, isRead: true };
    });
  vi.mocked(markAllAsRead)
    .mockReset()
    .mockImplementation(async (userId) =>
      itemsFor(userId).map((item) => ({ ...item, isRead: true })),
    );
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('NotificationsProvider — estado observado pelos consumidores', () => {
  it('não busca notificações nem expõe conteúdo sem autenticação', () => {
    render(tree(null));

    expect(listNotifications).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('0');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('aguarda o carregamento da sessão sem consultar dados privados', () => {
    render(tree(USER_A, true));

    expect(listNotifications).not.toHaveBeenCalled();
    expect(screen.queryByText(`Bolsa de ${USER_A.id}`)).not.toBeInTheDocument();
  });

  it('carrega usando somente a identidade do AuthContext', async () => {
    render(tree(USER_A));

    expect(await screen.findByText(`Bolsa de ${USER_A.id}`)).toBeInTheDocument();
    expect(listNotifications).toHaveBeenCalledExactlyOnceWith(USER_A.id);
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('2');
  });

  it('mostra carregamento enquanto a consulta não resolveu', async () => {
    const request = deferred<Notification[]>();
    vi.mocked(listNotifications).mockReturnValue(request.promise);
    render(tree(USER_A));

    expect(screen.getByRole('status', { name: 'Consulta principal' })).toHaveTextContent(
      'Carregando notificações',
    );
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    await act(async () => request.resolve(itemsFor(USER_A.id)));
    expect(screen.getByRole('status', { name: 'Consulta principal' })).toHaveTextContent(
      'Consulta encerrada',
    );
  });

  it('suporta lista vazia com contagem zero e sem erro', async () => {
    vi.mocked(listNotifications).mockResolvedValue([]);
    render(tree(USER_A));

    await waitFor(() => expect(listNotifications).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Consulta principal' })).toHaveTextContent(
        'Consulta encerrada',
      ),
    );
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('0');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('expõe falha de carregamento sem inventar notificações', async () => {
    vi.mocked(listNotifications).mockRejectedValue(new Error('Falha controlada'));
    render(tree(USER_A));

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao carregar notificações');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('retry faz nova consulta e remove o erro após sucesso', async () => {
    const user = userEvent.setup();
    vi.mocked(listNotifications).mockRejectedValueOnce(new Error('Falha controlada'));
    render(tree(USER_A));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Tentar novamente principal' }));

    expect(await screen.findByText(`Bolsa de ${USER_A.id}`)).toBeInTheDocument();
    expect(listNotifications).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('só confirma leitura individual e reduz contagem após a Promise resolver', async () => {
    const user = userEvent.setup();
    const request = deferred<Notification>();
    vi.mocked(markAsRead).mockReturnValue(request.promise);
    render(tree(USER_A));
    await screen.findByText(`Bolsa de ${USER_A.id}`);

    await user.click(screen.getByRole('button', { name: `Ler ${USER_A.id}-favorito principal` }));

    expect(markAsRead).toHaveBeenCalledExactlyOnceWith(USER_A.id, `${USER_A.id}-favorito`);
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('2');
    expect(screen.getAllByText('Não lida')).toHaveLength(2);
    await act(async () => request.resolve({ ...itemsFor(USER_A.id)[0], isRead: true }));
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('1');
    expect(screen.getAllByText('Lida')).toHaveLength(1);
  });

  it('falha individual preserva itens e contagem e permite repetir', async () => {
    const user = userEvent.setup();
    vi.mocked(markAsRead).mockRejectedValueOnce(new Error('Falha de leitura'));
    render(tree(USER_A));
    await screen.findByText(`Bolsa de ${USER_A.id}`);
    const button = screen.getByRole('button', { name: `Ler ${USER_A.id}-favorito principal` });

    await user.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('Leitura não confirmada');
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('2');
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() =>
      expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('1'),
    );
  });

  it('notificação já lida não dispara mutação redundante', async () => {
    const user = userEvent.setup();
    vi.mocked(listNotifications).mockResolvedValue(
      itemsFor(USER_A.id).map((item) => ({ ...item, isRead: true })),
    );
    render(tree(USER_A));
    await screen.findByText(`Bolsa de ${USER_A.id}`);

    await user.click(screen.getByRole('button', { name: `Ler ${USER_A.id}-favorito principal` }));

    expect(markAsRead).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('0');
  });

  it('uma leitura pendente não é disparada novamente por outro consumidor', async () => {
    const user = userEvent.setup();
    const request = deferred<Notification>();
    vi.mocked(markAsRead).mockReturnValue(request.promise);
    render(
      tree(
        USER_A,
        false,
        <>
          <Consumer name="um" />
          <Consumer name="dois" />
        </>,
      ),
    );
    await screen.findAllByText(`Bolsa de ${USER_A.id}`);

    await user.click(screen.getByRole('button', { name: `Ler ${USER_A.id}-favorito um` }));
    const otherButton = screen.getByRole('button', { name: `Ler ${USER_A.id}-favorito dois` });
    expect(otherButton).toBeDisabled();
    await user.click(otherButton);

    expect(markAsRead).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve({ ...itemsFor(USER_A.id)[0], isRead: true }));
    expect(screen.getByLabelText('Não lidas um')).toHaveTextContent('1');
    expect(screen.getByLabelText('Não lidas dois')).toHaveTextContent('1');
  });

  it('marca todas em uma única operação e só zera após confirmação', async () => {
    const user = userEvent.setup();
    const request = deferred<Notification[]>();
    vi.mocked(markAllAsRead).mockReturnValue(request.promise);
    render(tree(USER_A));
    await screen.findByText(`Bolsa de ${USER_A.id}`);

    await user.click(screen.getByRole('button', { name: 'Ler todas principal' }));

    expect(markAllAsRead).toHaveBeenCalledExactlyOnceWith(USER_A.id);
    expect(markAsRead).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('2');
    await act(async () =>
      request.resolve(itemsFor(USER_A.id).map((item) => ({ ...item, isRead: true }))),
    );
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('0');
    expect(screen.getAllByText('Lida')).toHaveLength(2);
  });

  it('protege o lote pendente contra cliques repetidos', async () => {
    const user = userEvent.setup();
    const request = deferred<Notification[]>();
    vi.mocked(markAllAsRead).mockReturnValue(request.promise);
    render(tree(USER_A));
    await screen.findByText(`Bolsa de ${USER_A.id}`);
    const button = screen.getByRole('button', { name: 'Ler todas principal' });

    await user.click(button);
    expect(button).toBeDisabled();
    await user.click(button);

    expect(markAllAsRead).toHaveBeenCalledTimes(1);
    await act(async () =>
      request.resolve(itemsFor(USER_A.id).map((item) => ({ ...item, isRead: true }))),
    );
  });

  it('falha do lote mantém todas não lidas e libera uma nova tentativa', async () => {
    const user = userEvent.setup();
    vi.mocked(markAllAsRead).mockRejectedValueOnce(new Error('Falha do lote'));
    render(tree(USER_A));
    await screen.findByText(`Bolsa de ${USER_A.id}`);
    const button = screen.getByRole('button', { name: 'Ler todas principal' });

    await user.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('Leitura não confirmada');
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('2');
    expect(screen.getAllByText('Não lida')).toHaveLength(2);
    expect(button).toBeEnabled();
  });

  it('logout limpa imediatamente os dados visíveis', async () => {
    const view = render(tree(USER_A));
    await screen.findByText(`Bolsa de ${USER_A.id}`);

    view.rerender(tree(null));

    expect(screen.queryByText(`Bolsa de ${USER_A.id}`)).not.toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('0');
  });

  it('troca de usuário remove dados anteriores enquanto carrega os novos', async () => {
    const requestB = deferred<Notification[]>();
    const view = render(tree(USER_A));
    await screen.findByText(`Bolsa de ${USER_A.id}`);
    vi.mocked(listNotifications).mockReturnValueOnce(requestB.promise);

    view.rerender(tree(USER_B));

    expect(screen.queryByText(`Bolsa de ${USER_A.id}`)).not.toBeInTheDocument();
    await act(async () => requestB.resolve(itemsFor(USER_B.id)));
    expect(screen.getByText(`Bolsa de ${USER_B.id}`)).toBeInTheDocument();
    expect(listNotifications).toHaveBeenLastCalledWith(USER_B.id);
  });

  it('resposta atrasada de A não substitui a lista de B', async () => {
    const requestA = deferred<Notification[]>();
    vi.mocked(listNotifications).mockImplementation((id) =>
      id === USER_A.id ? requestA.promise : Promise.resolve(itemsFor(id)),
    );
    const view = render(tree(USER_A));
    view.rerender(tree(USER_B));
    await screen.findByText(`Bolsa de ${USER_B.id}`);

    await act(async () => requestA.resolve(itemsFor(USER_A.id)));

    expect(screen.queryByText(`Bolsa de ${USER_A.id}`)).not.toBeInTheDocument();
    expect(screen.getByText(`Bolsa de ${USER_B.id}`)).toBeInTheDocument();
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('2');
  });

  it('resposta atrasada após logout não restaura dados privados', async () => {
    const request = deferred<Notification[]>();
    vi.mocked(listNotifications).mockReturnValue(request.promise);
    const view = render(tree(USER_A));
    view.rerender(tree(null));

    await act(async () => request.resolve(itemsFor(USER_A.id)));

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('0');
  });

  it('confirmação atrasada de leitura de A não altera a identidade B', async () => {
    const user = userEvent.setup();
    const request = deferred<Notification>();
    vi.mocked(markAsRead).mockReturnValue(request.promise);
    const view = render(tree(USER_A));
    await screen.findByText(`Bolsa de ${USER_A.id}`);
    await user.click(screen.getByRole('button', { name: `Ler ${USER_A.id}-favorito principal` }));
    view.rerender(tree(USER_B));
    await screen.findByText(`Bolsa de ${USER_B.id}`);

    await act(async () => request.resolve({ ...itemsFor(USER_A.id)[0], isRead: true }));

    expect(screen.queryByText(`Bolsa de ${USER_A.id}`)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('2');
  });

  it('consumidores simultâneos compartilham uma consulta inicial', async () => {
    render(
      tree(
        USER_A,
        false,
        <>
          <Consumer name="um" />
          <Consumer name="dois" />
        </>,
      ),
    );

    await screen.findAllByText(`Bolsa de ${USER_A.id}`);

    expect(listNotifications).toHaveBeenCalledExactlyOnceWith(USER_A.id);
    expect(
      within(screen.getByRole('region', { name: 'Consumidor um' })).getByText('2'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Não lidas dois')).toHaveTextContent('2');
  });

  it('remount de consumidor mantém leituras e não refaz a consulta', async () => {
    const user = userEvent.setup();
    const view = render(tree(USER_A));
    await screen.findByText(`Bolsa de ${USER_A.id}`);
    await user.click(screen.getByRole('button', { name: `Ler ${USER_A.id}-favorito principal` }));
    await waitFor(() =>
      expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('1'),
    );

    view.rerender(tree(USER_A, false, null));
    view.rerender(tree(USER_A));

    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('1');
    expect(listNotifications).toHaveBeenCalledTimes(1);
  });

  it('StrictMode com dois consumidores não duplica a consulta inicial', async () => {
    render(
      <StrictMode>
        {tree(
          USER_A,
          false,
          <>
            <Consumer name="um" />
            <Consumer name="dois" />
          </>,
        )}
      </StrictMode>,
    );

    await screen.findAllByText(`Bolsa de ${USER_A.id}`);

    expect(listNotifications).toHaveBeenCalledExactlyOnceWith(USER_A.id);
  });

  it('sessão expirada usa o handler de autenticação existente e oculta os dados', async () => {
    window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(USER_A));
    window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'token-ficticio-expiravel');
    render(
      <MemoryRouter initialEntries={['/seller']}>
        <AuthProvider>
          <NotificationsProvider>
            <Consumer />
          </NotificationsProvider>
          <PathProbe />
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText(`Bolsa de ${USER_A.id}`);

    act(() => handleAuthRequired('/seller'));

    expect(screen.queryByText(`Bolsa de ${USER_A.id}`)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Não lidas principal')).toHaveTextContent('0');
    expect(screen.getByLabelText('Rota atual')).toHaveTextContent('/login');
  });
});
