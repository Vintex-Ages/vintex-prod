import { createNotificationFixtures } from '@/mocks/notifications';
import type { Notification } from '@/types/notification';

const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';
const notificationsByUser = new Map<string, Notification[]>();

export class NotificationServiceError extends Error {
  constructor(
    public readonly code: 'INTEGRATION_UNAVAILABLE' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'NotificationServiceError';
  }
}

function userNotifications(userId: string): Notification[] {
  if (!useMocks) {
    throw new NotificationServiceError(
      'INTEGRATION_UNAVAILABLE',
      'A integração de notificações ainda não está disponível.',
    );
  }
  let items = notificationsByUser.get(userId);
  if (!items) {
    items = createNotificationFixtures(userId)
      .filter((item) => item.recipientUserId === userId)
      .map((item) => ({ ...item }))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    notificationsByUser.set(userId, items);
  }
  return items;
}

export async function listNotifications(userId: string): Promise<Notification[]> {
  return userNotifications(userId).map((item) => ({ ...item }));
}

export async function markAsRead(userId: string, notificationId: string): Promise<Notification> {
  const item = userNotifications(userId).find((entry) => entry.id === notificationId);
  if (!item) {
    throw new NotificationServiceError('NOT_FOUND', 'Notificação não encontrada.');
  }
  item.isRead = true;
  return { ...item };
}

export async function markAllAsRead(userId: string): Promise<Notification[]> {
  return userNotifications(userId).map((item) => {
    item.isRead = true;
    return { ...item };
  });
}

export function countUnread(items: readonly Notification[]): number {
  return items.filter((item) => !item.isRead).length;
}
