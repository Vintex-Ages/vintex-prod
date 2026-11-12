import { createNotificationFixtures } from '@/mocks/notifications';
import { httpClient } from '@/services/httpClient';
import type { Notification } from '@/types/notification';

const useMocks = import.meta.env.VITE_USE_MOCKS !== 'false';
const notificationsByUser = new Map<string, Notification[]>();

type ApiNotification = {
  id: number | string;
  type: string;
  product_id?: number | string | null;
  product_name: string;
  order_id?: number | string | null;
  created_at: string;
  is_read: boolean;
};

type ApiNotificationResponse = {
  items: ApiNotification[];
  page: number;
  page_size: number;
  total: number;
  unread_count: number;
};

export type NotificationPage = {
  items: Notification[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
};

export class NotificationServiceError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'NotificationServiceError';
  }
}

function mapApiNotification(item: ApiNotification): Notification {
  return {
    id: String(item.id),
    type: item.type,
    ...(item.product_id != null && {
      productId: String(item.product_id),
    }),
    productName: item.product_name,
    ...(item.order_id != null && {
      orderId: String(item.order_id),
    }),
    createdAt: item.created_at,
    isRead: item.is_read,
  };
}

function getMockNotifications(userId: string): Notification[] {
  let items = notificationsByUser.get(userId);

  if (!items) {
    items = createNotificationFixtures(userId)
      .map((item) => ({ ...item }))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    notificationsByUser.set(userId, items);
  }

  return items;
}

export async function listNotifications(userId: string): Promise<NotificationPage> {
  if (useMocks) {
    const items = getMockNotifications(userId).map((item) => ({ ...item }));

    return {
      items,
      page: 1,
      pageSize: items.length,
      total: items.length,
      unreadCount: items.filter((item) => !item.isRead).length,
    };
  }

  const response = await httpClient.get<ApiNotificationResponse>('/users/me/notifications', {
    params: {
      page: 1,
      page_size: 50,
    },
  });

  return {
    items: response.data.items.map(mapApiNotification),
    page: response.data.page,
    pageSize: response.data.page_size,
    total: response.data.total,
    unreadCount: response.data.unread_count,
  };
}

export async function markAsRead(userId: string, notificationId: string): Promise<void> {
  if (useMocks) {
    const item = getMockNotifications(userId).find((entry) => entry.id === notificationId);

    if (!item) {
      throw new NotificationServiceError('NOT_FOUND', 'Notificação não encontrada.');
    }

    item.isRead = true;
    return;
  }

  try {
    await httpClient.post(`/users/me/notifications/${encodeURIComponent(notificationId)}/read`);
  } catch (error: unknown) {
    if ((error as { response?: { status?: number } } | null)?.response?.status === 404) {
      throw new NotificationServiceError('NOT_FOUND', 'Notificação não encontrada.');
    }

    throw error;
  }
}

export async function markAllAsRead(userId: string): Promise<void> {
  if (useMocks) {
    getMockNotifications(userId).forEach((item) => {
      item.isRead = true;
    });
    return;
  }

  await httpClient.post('/users/me/notifications/read');
}
