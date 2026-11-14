import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './useAuth';
import { NotificationsContext } from './useNotifications';
import * as notificationService from '@/services/notificationService';
import type { Notification } from '@/types/notification';

function isIntegrationUnavailable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'INTEGRATION_UNAVAILABLE'
  );
}

function createSession(userId: string | null) {
  return {
    userId,
    active: true,
    loadRequest: null as Promise<void> | null,
    individualRequests: new Map<string, Promise<void>>(),
    batchRequest: null as Promise<void> | null,
    confirmedReads: new Set<string>(),
  };
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const identity = !auth.loading && auth.isAuthenticated && auth.user ? auth.user.id : null;

  const [session, setSession] = useState(() => createSession(identity));
  const { userId } = session;
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(identity !== null);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [markingAll, setMarkingAll] = useState(false);

  if (session.userId !== identity) {
    session.active = false;
    setSession(createSession(identity));
    setItems([]);
    setUnreadCount(0);
    setLoading(identity !== null);
    setError(null);
    setAvailable(true);
    setPendingIds([]);
    setMarkingAll(false);
  }

  const load = useCallback(() => {
    if (!userId || !session.active || session.loadRequest) return;

    setLoading(true);
    setError(null);

    session.loadRequest = notificationService
      .listNotifications(userId)
      .then((result) => {
        if (!session.active) return;

        setAvailable(true);

        const confirmedOnPage = result.items.filter(
          (item) => !item.isRead && session.confirmedReads.has(item.id),
        ).length;

        setItems(
          result.items
            .map((item) => ({
              ...item,
              isRead: item.isRead || session.confirmedReads.has(item.id),
            }))
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
        );

        setUnreadCount(Math.max(0, result.unreadCount - confirmedOnPage));
      })
      .catch((loadError: unknown) => {
        if (!session.active) return;

        if (isIntegrationUnavailable(loadError)) {
          setAvailable(false);
          setItems([]);
          setUnreadCount(0);
          setError(null);
          return;
        }

        setError('Não foi possível carregar as notificações.');
      })
      .finally(() => {
        session.loadRequest = null;
        if (session.active) setLoading(false);
      });
  }, [session, userId]);

  useEffect(() => {
    session.active = true;
    load();

    return () => {
      session.active = false;
    };
  }, [load, session]);

  async function markAsRead(id: string): Promise<void> {
    if (!session.active || !userId) {
      throw new Error('Sessão de notificações encerrada.');
    }

    const pending = session.individualRequests.get(id);
    if (pending) return pending;

    if (session.batchRequest) {
      throw new Error('Aguarde a leitura em andamento.');
    }

    const item = items.find((entry) => entry.id === id);
    if (!item) throw new Error('Notificação não encontrada.');
    if (item.isRead || session.confirmedReads.has(id)) return;

    const request = (async () => {
      await notificationService.markAsRead(userId, id);

      if (!session.active) {
        throw new Error('Sessão de notificações encerrada.');
      }

      session.confirmedReads.add(id);
      setItems((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, isRead: true } : entry)),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    })();

    session.individualRequests.set(id, request);
    setPendingIds([...session.individualRequests.keys()]);

    try {
      await request;
    } finally {
      session.individualRequests.delete(id);
      if (session.active) {
        setPendingIds([...session.individualRequests.keys()]);
      }
    }
  }

  async function markAllAsRead(): Promise<void> {
    if (!session.active || !userId) {
      throw new Error('Sessão de notificações encerrada.');
    }

    if (session.batchRequest) return session.batchRequest;

    if (session.individualRequests.size > 0) {
      throw new Error('Aguarde a leitura em andamento.');
    }

    if (unreadCount === 0) return;

    const request = (async () => {
      await notificationService.markAllAsRead(userId);

      if (!session.active) {
        throw new Error('Sessão de notificações encerrada.');
      }

      items.forEach((item) => session.confirmedReads.add(item.id));
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    })();

    session.batchRequest = request;
    setMarkingAll(true);

    try {
      await request;
    } finally {
      session.batchRequest = null;
      if (session.active) setMarkingAll(false);
    }
  }

  return (
    <NotificationsContext.Provider
      value={{
        items,
        available,
        unreadCount,
        loading,
        error,
        pendingIds,
        markingAll,
        retry: load,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}
