import type { Notification } from '@/types/notification';

/**
 * Dados fictícios estáveis: a soma dos caracteres do usuário, módulo três,
 * seleciona lista vazia (0), uma não lida (1) ou uma lista mista (2).
 * Não simula eventos do checkout ou do catálogo.
 */
export function createNotificationFixtures(userId: string): Notification[] {
  const scenario =
    Array.from(userId).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 3;
  if (scenario === 0) return [];

  const favorite: Notification = {
    id: `${userId}-favorito-ficticio`,
    recipientUserId: userId,
    type: 'favorite',
    productId: '1',
    productName: 'Jaqueta de demonstração',
    createdAt: '2026-10-21T15:00:00.000Z',
    isRead: false,
  };
  if (scenario === 1) return [favorite];

  return [
    favorite,
    {
      id: `${userId}-venda-ficticia`,
      recipientUserId: userId,
      type: 'sale',
      productName: 'Bolsa de demonstração',
      createdAt: '2026-10-20T15:00:00.000Z',
      isRead: false,
    },
    {
      id: `${userId}-venda-lida-ficticia`,
      recipientUserId: userId,
      type: 'sale',
      productName: 'Casaco de demonstração',
      createdAt: '2026-10-19T15:00:00.000Z',
      isRead: true,
    },
  ];
}
