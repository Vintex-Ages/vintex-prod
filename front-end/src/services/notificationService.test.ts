import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Notification } from '@/types/notification';

type NotificationService = typeof import('./notificationService');

const doubles = vi.hoisted(() => ({
  createFixtures: vi.fn<(userId: string) => Notification[]>(),
  httpClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
}));

vi.mock('@/mocks/notifications', () => ({ createNotificationFixtures: doubles.createFixtures }));
vi.mock('@/services/httpClient', () => ({ httpClient: doubles.httpClient }));

const USER_A = 'usuario-ficticio-341-a';
const USER_B = 'usuario-ficticio-341-b';
const EMPTY_USER = 'usuario-ficticio-341-vazio';

function fixtures(userId: string): Notification[] {
  if (userId === EMPTY_USER) return [];
  return [
    {
      id: `${userId}-antiga-lida`,
      type: 'sale',
      recipientUserId: userId,
      productName: 'Casaco fictício',
      createdAt: '2026-10-19T15:00:00.000Z',
      isRead: true,
    },
    {
      id: `${userId}-favorito`,
      type: 'favorite',
      recipientUserId: userId,
      productId: 'produto-ficticio-favorito',
      productName: 'Bolsa fictícia',
      createdAt: '2026-10-21T15:00:00.000Z',
      isRead: false,
    },
    {
      id: `${userId}-venda`,
      type: 'sale',
      recipientUserId: userId,
      productId: 'produto-ficticio-vendido',
      productName: 'Jaqueta fictícia',
      createdAt: '2026-10-20T15:00:00.000Z',
      isRead: false,
    },
  ];
}

let service: NotificationService;

beforeEach(async () => {
  vi.stubEnv('VITE_USE_MOCKS', 'true');
  vi.resetModules();
  vi.clearAllMocks();
  doubles.createFixtures.mockReset().mockImplementation(fixtures);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Requisição real não autorizada'));
  service = await import('./notificationService');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('notificationService — contrato interno do mock', () => {
  it('lista somente as notificações do destinatário solicitado', async () => {
    const items = await service.listNotifications(USER_A);

    expect(items).toHaveLength(3);
    expect(items.every((item) => item.recipientUserId === USER_A)).toBe(true);
    expect(items.some((item) => item.id.startsWith(USER_B))).toBe(false);
  });

  it('ordena por createdAt, da mais recente para a mais antiga', async () => {
    const items = await service.listNotifications(USER_A);

    expect(items.map((item) => item.id)).toEqual([
      `${USER_A}-favorito`,
      `${USER_A}-venda`,
      `${USER_A}-antiga-lida`,
    ]);
  });

  it('suporta usuário sem notificações', async () => {
    const items = await service.listNotifications(EMPTY_USER);

    expect(items).toEqual([]);
    expect(service.countUnread(items)).toBe(0);
  });

  it('preserva notificações lidas e não lidas na mesma listagem', async () => {
    const items = await service.listNotifications(USER_A);

    expect(items.filter((item) => item.isRead)).toHaveLength(1);
    expect(items.filter((item) => !item.isRead)).toHaveLength(2);
  });

  it('preserva exatamente sale e favorite, incluindo venda sem productId', async () => {
    const items = await service.listNotifications(USER_A);

    expect(new Set(items.map((item) => item.type))).toEqual(new Set(['sale', 'favorite']));
    expect(items.find((item) => item.id === `${USER_A}-antiga-lida`)).not.toHaveProperty(
      'productId',
    );
    expect(items.find((item) => item.type === 'favorite')).toMatchObject({
      productId: 'produto-ficticio-favorito',
    });
  });

  it('conta somente não lidas, sem alterar os itens nem buscar novamente', async () => {
    const items = await service.listNotifications(USER_A);
    const before = structuredClone(items);
    doubles.createFixtures.mockClear();

    expect(service.countUnread(items)).toBe(2);
    expect(items).toEqual(before);
    expect(doubles.createFixtures).not.toHaveBeenCalled();
  });

  it('marca somente a notificação escolhida e retorna sua confirmação', async () => {
    const updated = await service.markAsRead(USER_A, `${USER_A}-favorito`);
    const items = await service.listNotifications(USER_A);

    expect(updated).toMatchObject({ id: `${USER_A}-favorito`, isRead: true });
    expect(items.find((item) => item.id === `${USER_A}-favorito`)?.isRead).toBe(true);
    expect(items.find((item) => item.id === `${USER_A}-venda`)?.isRead).toBe(false);
    expect(service.countUnread(items)).toBe(1);
  });

  it('marcar uma não modifica notificações de outro usuário', async () => {
    const beforeB = await service.listNotifications(USER_B);

    await service.markAsRead(USER_A, `${USER_A}-favorito`);

    expect(await service.listNotifications(USER_B)).toEqual(beforeB);
  });

  it('marca todas do destinatário e retorna a lista confirmada', async () => {
    const updated = await service.markAllAsRead(USER_A);

    expect(updated).toHaveLength(3);
    expect(updated.every((item) => item.isRead)).toBe(true);
    expect(service.countUnread(await service.listNotifications(USER_A))).toBe(0);
  });

  it('marcar todas não modifica notificações de outro usuário', async () => {
    const beforeB = await service.listNotifications(USER_B);

    await service.markAllAsRead(USER_A);

    expect(await service.listNotifications(USER_B)).toEqual(beforeB);
  });

  it('marcar uma já lida é idempotente', async () => {
    await service.markAsRead(USER_A, `${USER_A}-favorito`);
    const before = await service.listNotifications(USER_A);

    await service.markAsRead(USER_A, `${USER_A}-favorito`);

    expect(await service.listNotifications(USER_A)).toEqual(before);
    expect(service.countUnread(before)).toBe(1);
  });

  it('marcar todas novamente é idempotente, inclusive na lista vazia', async () => {
    const first = await service.markAllAsRead(USER_A);

    expect(await service.markAllAsRead(USER_A)).toEqual(first);
    expect(await service.markAllAsRead(EMPTY_USER)).toEqual([]);
  });

  it('não expõe armazenamento por referência na listagem', async () => {
    const items = await service.listNotifications(USER_A);
    items[0].isRead = true;
    items[0].productName = 'Nome alterado externamente';
    items.pop();

    const next = await service.listNotifications(USER_A);
    expect(next).toHaveLength(3);
    expect(next[0]).toMatchObject({ productName: 'Bolsa fictícia', isRead: false });
  });

  it('não expõe armazenamento pelo retorno da leitura individual', async () => {
    const updated = await service.markAsRead(USER_A, `${USER_A}-favorito`);
    updated.isRead = false;

    const items = await service.listNotifications(USER_A);
    expect(items.find((item) => item.id === updated.id)?.isRead).toBe(true);
  });

  it('não expõe armazenamento pelo retorno da leitura em lote', async () => {
    const updated = await service.markAllAsRead(USER_A);
    updated[0].isRead = false;
    updated.pop();

    const items = await service.listNotifications(USER_A);
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.isRead)).toBe(true);
  });

  it('preserva a leitura ao listar novamente, sem duplicar notificações', async () => {
    await service.listNotifications(USER_A);
    await service.markAsRead(USER_A, `${USER_A}-favorito`);

    expect(service.countUnread(await service.listNotifications(USER_A))).toBe(1);
    expect(service.countUnread(await service.listNotifications(USER_A))).toBe(1);
    expect(await service.listNotifications(USER_A)).toHaveLength(3);
  });

  it('rejeita ID inexistente sem alterar o estado', async () => {
    const before = await service.listNotifications(USER_A);

    await expect(service.markAsRead(USER_A, 'notificacao-inexistente')).rejects.toBeInstanceOf(
      Error,
    );

    expect(await service.listNotifications(USER_A)).toEqual(before);
  });

  it('não permite marcar uma notificação de outro destinatário', async () => {
    const beforeB = await service.listNotifications(USER_B);

    await expect(service.markAsRead(USER_A, `${USER_B}-favorito`)).rejects.toBeInstanceOf(Error);

    expect(await service.listNotifications(USER_B)).toEqual(beforeB);
  });

  it.each([
    { operation: 'listagem', run: () => service.listNotifications(USER_A) },
    {
      operation: 'leitura individual',
      run: () => service.markAsRead(USER_A, `${USER_A}-favorito`),
    },
    { operation: 'leitura em lote', run: () => service.markAllAsRead(USER_A) },
  ])('propaga falha na $operation do mock', async ({ run }) => {
    const error = new Error('Fixture indisponível');
    doubles.createFixtures.mockImplementation(() => {
      throw error;
    });

    await expect(run()).rejects.toBe(error);
  });

  it('opera no mock sem qualquer chamada HTTP ou fetch', async () => {
    await service.listNotifications(USER_A);
    await service.markAsRead(USER_A, `${USER_A}-favorito`);
    await service.markAllAsRead(USER_A);

    Object.values(doubles.httpClient).forEach((method) => expect(method).not.toHaveBeenCalled());
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([undefined, 'true', '1'])('mantém o mock para VITE_USE_MOCKS=%s', async (flag) => {
    vi.stubEnv('VITE_USE_MOCKS', flag);
    vi.resetModules();
    const selected = await import('./notificationService');

    expect(await selected.listNotifications(USER_A)).toHaveLength(3);
    expect(doubles.httpClient.get).not.toHaveBeenCalled();
  });

  it('VITE_USE_MOCKS=false rejeita operações sem inventar endpoint ou dados reais', async () => {
    vi.stubEnv('VITE_USE_MOCKS', 'false');
    vi.resetModules();
    doubles.createFixtures.mockClear();
    const realMode = await import('./notificationService');

    await expect(realMode.listNotifications(USER_A)).rejects.toBeInstanceOf(Error);
    await expect(realMode.markAsRead(USER_A, 'id-ficticio')).rejects.toBeInstanceOf(Error);
    await expect(realMode.markAllAsRead(USER_A)).rejects.toBeInstanceOf(Error);
    expect(doubles.createFixtures).not.toHaveBeenCalled();
    Object.values(doubles.httpClient).forEach((method) => expect(method).not.toHaveBeenCalled());
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
