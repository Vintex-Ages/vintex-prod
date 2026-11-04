import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotificationFixtures } from '@/mocks/notifications';
import { httpClient } from '@/services/httpClient';

vi.mock('@/services/httpClient', () => ({
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/mocks/notifications', () => ({
  createNotificationFixtures: vi.fn(),
}));

const mockedGet = vi.mocked(httpClient.get);
const mockedPost = vi.mocked(httpClient.post);
const mockedFixtures = vi.mocked(createNotificationFixtures);

function apiNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    type: 'sale',
    product_id: 7,
    product_name: 'Jaqueta jeans',
    order_id: 31,
    created_at: '2026-10-28T14:03:11',
    is_read: false,
    ...overrides,
  };
}

function apiResponse(
  items = [apiNotification()],
  overrides: Record<string, unknown> = {},
) {
  return {
    items,
    page: 1,
    page_size: 20,
    total: items.length,
    unread_count: items.filter((item) => item.is_read === false).length,
    ...overrides,
  };
}

describe('notificationService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_USE_MOCKS', 'true');
  });

  describe('modo mock', () => {
    it('lista notificações fictícias do usuário', async () => {
      const fixtures = [
        {
          id: 'user-1-notification',
          type: 'favorite',
          productId: '7',
          productName: 'Jaqueta jeans',
          createdAt: '2026-10-28T14:03:11',
          isRead: false,
        },
      ];

      mockedFixtures.mockReturnValue(fixtures);

      const service = await import('@/services/notificationService');
      const result = await service.listNotifications('user-1');

      expect(mockedFixtures).toHaveBeenCalledWith('user-1');
      expect(result.items).toEqual(fixtures);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(1);
      expect(result.total).toBe(1);
      expect(result.unreadCount).toBe(1);
      expect(mockedGet).not.toHaveBeenCalled();
    });

    it('marca uma notificação fictícia como lida', async () => {
      mockedFixtures.mockReturnValue([
        {
          id: 'notification-1',
          type: 'sale',
          productName: 'Jaqueta',
          createdAt: '2026-10-28T14:03:11',
          isRead: false,
        },
      ]);

      const service = await import('@/services/notificationService');

      await service.markAsRead('user-1', 'notification-1');

      const result = await service.listNotifications('user-1');
      expect(result.items[0].isRead).toBe(true);
      expect(result.unreadCount).toBe(0);
    });

    it('não permite marcar uma notificação fictícia inexistente', async () => {
      mockedFixtures.mockReturnValue([]);

      const service = await import('@/services/notificationService');

      await expect(
        service.markAsRead('user-1', 'inexistente'),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        name: 'NotificationServiceError',
      });
    });

    it('marca todas as notificações fictícias como lidas', async () => {
      mockedFixtures.mockReturnValue([
        {
          id: 'notification-1',
          type: 'sale',
          productName: 'Jaqueta',
          createdAt: '2026-10-28T14:03:11',
          isRead: false,
        },
        {
          id: 'notification-2',
          type: 'favorite',
          productName: 'Bolsa',
          createdAt: '2026-10-27T14:03:11',
          isRead: false,
        },
      ]);

      const service = await import('@/services/notificationService');

      await service.markAllAsRead('user-1');

      const result = await service.listNotifications('user-1');

      expect(result.items.every((item) => item.isRead)).toBe(true);
      expect(result.unreadCount).toBe(0);
    });
  });

  describe('modo API', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_USE_MOCKS', 'false');
    });

    it('busca a primeira página de notificações na API', async () => {
      mockedGet.mockResolvedValue({
        data: apiResponse(),
      } as never);

      const service = await import('@/services/notificationService');
      const result = await service.listNotifications('user-1');

      expect(mockedGet).toHaveBeenCalledWith(
        '/api/users/me/notifications',
        {
          params: {
            page: 1,
            page_size: 50,
          },
        },
      );

      expect(result).toEqual({
        items: [
          {
            id: '12',
            type: 'sale',
            productId: '7',
            productName: 'Jaqueta jeans',
            orderId: '31',
            createdAt: '2026-10-28T14:03:11',
            isRead: false,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
        unreadCount: 1,
      });
    });

    it('preserva tipos desconhecidos recebidos da API', async () => {
      mockedGet.mockResolvedValue({
        data: apiResponse([
          apiNotification({
            type: 'new_backend_type',
          }),
        ]),
      } as never);

      const service = await import('@/services/notificationService');
      const result = await service.listNotifications('user-1');

      expect(result.items[0].type).toBe('new_backend_type');
    });

    it('não inclui IDs opcionais quando não são enviados pela API', async () => {
      mockedGet.mockResolvedValue({
        data: apiResponse([
          apiNotification({
            product_id: null,
            order_id: null,
          }),
        ]),
      } as never);

      const service = await import('@/services/notificationService');
      const result = await service.listNotifications('user-1');

      expect(result.items[0]).toEqual({
        id: '12',
        type: 'sale',
        productName: 'Jaqueta jeans',
        createdAt: '2026-10-28T14:03:11',
        isRead: false,
      });
    });

    it('usa o unread_count enviado pelo backend', async () => {
      mockedGet.mockResolvedValue({
        data: apiResponse(
          [apiNotification()],
          { unread_count: 47, total: 100 },
        ),
      } as never);

      const service = await import('@/services/notificationService');
      const result = await service.listNotifications('user-1');

      expect(result.unreadCount).toBe(47);
      expect(result.total).toBe(100);
    });

    it('não utiliza fixtures no modo API', async () => {
      mockedGet.mockResolvedValue({
        data: apiResponse(),
      } as never);

      const service = await import('@/services/notificationService');

      await service.listNotifications('user-1');

      expect(mockedFixtures).not.toHaveBeenCalled();
    });

    it('envia a requisição para marcar uma notificação como lida', async () => {
      mockedPost.mockResolvedValue({ status: 204 } as never);

      const service = await import('@/services/notificationService');

      await service.markAsRead('user-1', '12');

      expect(mockedPost).toHaveBeenCalledWith(
        '/api/users/me/notifications/12/read',
      );
    });

    it('codifica o ID da notificação na URL', async () => {
      mockedPost.mockResolvedValue({ status: 204 } as never);

      const service = await import('@/services/notificationService');

      await service.markAsRead('user-1', 'id/com espaço');

      expect(mockedPost).toHaveBeenCalledWith(
        '/api/users/me/notifications/id%2Fcom%20espa%C3%A7o/read',
      );
    });

    it('envia a requisição para marcar todas como lidas', async () => {
      mockedPost.mockResolvedValue({ status: 204 } as never);

      const service = await import('@/services/notificationService');

      await service.markAllAsRead('user-1');

      expect(mockedPost).toHaveBeenCalledWith(
        '/api/users/me/notifications/read',
      );
    });

    it('converte resposta 404 em erro NOT_FOUND', async () => {
      mockedPost.mockRejectedValue({
        response: { status: 404 },
      });

      const service = await import('@/services/notificationService');

      await expect(
        service.markAsRead('user-1', '999'),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('preserva erros 401 da API', async () => {
      const unauthorized = {
        response: { status: 401 },
      };

      mockedGet.mockRejectedValue(unauthorized);

      const service = await import('@/services/notificationService');

      await expect(
        service.listNotifications('user-1'),
      ).rejects.toBe(unauthorized);
    });

    it('preserva erros inesperados da API', async () => {
      const serverError = {
        response: { status: 500 },
      };

      mockedPost.mockRejectedValue(serverError);

      const service = await import('@/services/notificationService');

      await expect(
        service.markAllAsRead('user-1'),
      ).rejects.toBe(serverError);
    });

    it('exporta o erro específico de notificação inexistente', async () => {
      const service = await import('@/services/notificationService');

      const error = new service.NotificationServiceError(
        'NOT_FOUND',
        'Notificação não encontrada.',
      );

      expect(error.name).toBe('NotificationServiceError');
      expect(error.code).toBe('NOT_FOUND');
    });
  });
});