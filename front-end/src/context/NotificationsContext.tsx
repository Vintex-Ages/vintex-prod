import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './useAuth';
import { NotificationsContext } from './useNotifications';
import * as notificationService from '@/services/notificationService';
import type { Notification } from '@/types/notification';

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
  const [loading, setLoading] = useState(userId !== null);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [markingAll, setMarkingAll] = useState(false);
  // `false` quando o back ainda não tem a rota (back-end#261): o sino some.
  const [available, setAvailable] = useState(true);

  // Limpa antes de renderizar consumidores, sem remontar as páginas do app.
  // A sessão antiga fica inválida mesmo se uma Promise resolver após novo login.
  if (session.userId !== identity) {
    session.active = false;
    setSession(createSession(identity));
    setItems([]);
    setLoading(identity !== null);
    setError(null);
    setPendingIds([]);
    setMarkingAll(false);
    setAvailable(true);
  }

  const load = useCallback(() => {
    if (!userId || !session.active || session.loadRequest) return;
    setLoading(true);
    setError(null);
    session.loadRequest = notificationService
      .listNotifications(userId)
      .then((result) => {
        if (!session.active) return;
        setItems(
          result
            .filter((item) => item.recipientUserId === userId)
            .map((item) => ({
              ...item,
              isRead: item.isRead || session.confirmedReads.has(item.id),
            }))
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
        );
      })
      .catch((caught: unknown) => {
        if (!session.active) return;
        if ((caught as { code?: string } | null)?.code === 'INTEGRATION_UNAVAILABLE') {
          setAvailable(false);
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
    if (!session.active || !userId) throw new Error('Sessão de notificações encerrada.');
    const pending = session.individualRequests.get(id);
    if (pending) return pending;
    if (session.batchRequest) throw new Error('Aguarde a leitura em andamento.');
    const item = items.find((entry) => entry.id === id);
    if (!item) throw new Error('Notificação não encontrada.');
    if (item.isRead || session.confirmedReads.has(id)) return;

    const request = (async () => {
      const updated = await notificationService.markAsRead(userId, id);
      if (!session.active) throw new Error('Sessão de notificações encerrada.');
      if (updated.recipientUserId !== userId || updated.id !== id || !updated.isRead) {
        throw new Error('A leitura da notificação não foi confirmada.');
      }
      session.confirmedReads.add(id);
      setItems((current) => current.map((entry) => (entry.id === id ? { ...updated } : entry)));
    })();
    session.individualRequests.set(id, request);
    setPendingIds([...session.individualRequests.keys()]);
    try {
      await request;
    } finally {
      session.individualRequests.delete(id);
      if (session.active) setPendingIds([...session.individualRequests.keys()]);
    }
  }

  async function markAllAsRead(): Promise<void> {
    if (!session.active || !userId) throw new Error('Sessão de notificações encerrada.');
    if (session.batchRequest) return session.batchRequest;
    if (session.individualRequests.size) throw new Error('Aguarde a leitura em andamento.');
    if (notificationService.countUnread(items) === 0) return;

    const request = (async () => {
      const updated = await notificationService.markAllAsRead(userId);
      if (!session.active) throw new Error('Sessão de notificações encerrada.');
      if (updated.some((item) => item.recipientUserId !== userId || !item.isRead)) {
        throw new Error('A leitura das notificações não foi confirmada.');
      }
      updated.forEach((item) => session.confirmedReads.add(item.id));
      setItems((current) =>
        current.map((item) => ({
          ...item,
          isRead: item.isRead || session.confirmedReads.has(item.id),
        })),
      );
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
        unreadCount: notificationService.countUnread(items),
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
