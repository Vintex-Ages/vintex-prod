import { createContext, useContext } from 'react';
import type { Notification } from '@/types/notification';

export interface NotificationsContextValue {
  items: Notification[];
  /** `false` enquanto o back não tem notificações: quem consome não mostra o sino. */
  available: boolean;
  unreadCount: number;
  loading: boolean;
  error: string | null;
  pendingIds: string[];
  markingAll: boolean;
  retry: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications deve ser usado dentro de um <NotificationsProvider>.');
  }
  return context;
}
