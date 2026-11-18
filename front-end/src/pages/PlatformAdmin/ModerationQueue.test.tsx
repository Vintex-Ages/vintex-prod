import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { ToastProvider } from '@/context/ToastContext';
import {
  AdminModerationError,
  listSuspended,
  restoreProduct,
} from '@/services/adminModerationService';
import type { ModerationResult, SuspendedProduct } from '@/types/adminModeration';
import type { Paginated } from '@/types/product';
import ModerationQueue from './ModerationQueue';

vi.mock('@/services/adminModerationService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/adminModerationService')>()),
  listSuspended: vi.fn(),
  restoreProduct: vi.fn(),
}));

// RED #414: página/hook/lista reais no GREEN; só os limites do service são
// substituídos. Fixtures não compartilham IDs com o catálogo de demonstração.
const AUTH: AuthContextValue = {
  user: {
    id: '414-admin',
    name: 'Eva Vieira',
    email: 'admin@example.test',
    is_admin: true,
    is_seller: false,
  },
  token: 'test-token',
  isAuthenticated: true,
  loading: false,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
};

function product(id: string, overrides: Partial<SuspendedProduct> = {}): SuspendedProduct {
  return {
    id,
    name: `Peça ${id}`,
    price: 90,
    status: 'despublicado',
    coverImageUrl: null,
    store: { id: '414-store', name: 'Brechó Aurora' },
    moderationReason: 'Material divergente.',
    moderatedAt: '2026-11-14T12:30:00Z',
    ...overrides,
  };
}

function page(
  items: SuspendedProduct[],
  number = 1,
  total = items.length,
): Paginated<SuspendedProduct> {
  return { items, page: number, pageSize: 20, total };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderQueue() {
  return render(
    <MemoryRouter initialEntries={['/admin/moderation']}>
      <AuthContext.Provider value={AUTH}>
        <ToastProvider>
          <ModerationQueue />
        </ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function rows() {
  return within(screen.getByRole('list', { name: /suspens/i })).getAllByRole('listitem');
}
function restoreButton(row: HTMLElement) {
  return within(row).getByRole('button', { name: 'Restaurar anúncio' });
}

beforeEach(() => {
  vi.mocked(listSuspended)
    .mockReset()
    .mockResolvedValue(page([product('41401'), product('41402')]));
  vi.mocked(restoreProduct).mockReset().mockResolvedValue({ productId: '41401', status: 'ativo' });
});
afterEach(cleanup);

describe('ModerationQueue — RED #414', () => {
  it('usa um AdminHeader com quatro abas e Moderação ativa, sem layout global', async () => {
    renderQueue();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Anúncios suspensos' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    const nav = within(screen.getByRole('navigation', { name: 'Área administrativa' }));
    expect(nav.getAllByRole('link')).toHaveLength(4);
    expect(nav.getByRole('link', { name: 'Anúncios suspensos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    await screen.findByText('Peça 41401');
    expect(listSuspended).toHaveBeenCalledExactlyOnceWith({ page: 1, pageSize: 20 });
  });

  it('mostra skeleton acessível enquanto a consulta está pendente', async () => {
    const pending = deferred<Paginated<SuspendedProduct>>();
    vi.mocked(listSuspended).mockReturnValue(pending.promise);
    renderQueue();
    const skeleton = screen.getByRole('status', { name: /carregando.*suspens/i });
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: 'Restaurar anúncio' })).not.toBeInTheDocument();
    await act(async () => pending.resolve(page([product('41401')])));
    expect(skeleton).not.toBeInTheDocument();
  });

  it('lista exclusivamente o retorno do service com os dados de moderação', async () => {
    renderQueue();
    await screen.findByRole('list', { name: /suspens/i });
    const first = within(rows()[0]);
    expect(first.getByText('Peça 41401')).toBeInTheDocument();
    expect(first.getByText('Brechó Aurora')).toBeInTheDocument();
    expect(first.getByRole('img', { name: 'Peça 41401' })).toBeInTheDocument();
    expect(first.getByText('Suspensa', { exact: true })).toBeInTheDocument();
    expect(first.getByText('Material divergente.')).toBeInTheDocument();
    expect(rows()[0].querySelector('time')).toHaveTextContent(/14\/11\/2026/);
    expect(restoreButton(rows()[0])).toBeEnabled();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/Em análise|Revisar correção|Pausados/)).not.toBeInTheDocument();
  });

  it('lista vazia tem mensagem apropriada e nenhuma restauração', async () => {
    vi.mocked(listSuspended).mockResolvedValue(page([]));
    renderQueue();
    expect(await screen.findByText(/nenhum anúncio suspenso/i)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /suspens/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restaurar anúncio' })).not.toBeInTheDocument();
  });

  it('erro inicial é anunciado e Tentar novamente recupera a lista', async () => {
    vi.mocked(listSuspended).mockRejectedValueOnce(new Error('rede'));
    renderQueue();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/não foi possível carregar/i);
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Peça 41401')).toBeInTheDocument();
    expect(listSuspended).toHaveBeenCalledTimes(2);
  });

  it('403 do service informa falta de permissão sem sugerir repetição inútil', async () => {
    vi.mocked(listSuspended).mockRejectedValue(
      new AdminModerationError('FORBIDDEN', 'Sem permissão.', 403, 'ADMIN_REQUIRED'),
    );
    renderQueue();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/permissão/i);
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
  });

  it('Carregar mais mostra a próxima página e desaparece ao atingir o total', async () => {
    const first = Array.from({ length: 20 }, (_, i) => product(`414-${i}`));
    vi.mocked(listSuspended)
      .mockResolvedValueOnce(page(first, 1, 21))
      .mockResolvedValueOnce(page([product('414-last')], 2, 21));
    renderQueue();
    await screen.findByText('Peça 414-0');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Peça 414-last')).toBeInTheDocument();
    expect(rows()).toHaveLength(21);
    expect(listSuspended).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 });
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });

  it('falha ao carregar mais preserva cartões e permite tentar a mesma página', async () => {
    const first = Array.from({ length: 20 }, (_, i) => product(`414-${i}`));
    vi.mocked(listSuspended)
      .mockResolvedValueOnce(page(first, 1, 21))
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce(page([product('414-last')], 2, 21));
    renderQueue();
    await screen.findByText('Peça 414-0');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/carregar mais/i);
    expect(rows()).toHaveLength(20);
    await user.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await screen.findByText('Peça 414-last')).toBeInTheDocument();
    expect(rows()).toHaveLength(21);
  });

  it('restauração pendente trava duplo envio, preserva cartões e não indica sucesso', async () => {
    const pending = deferred<ModerationResult>();
    vi.mocked(restoreProduct).mockReturnValue(pending.promise);
    renderQueue();
    await screen.findByText('Peça 41401');
    const button = restoreButton(rows()[0]);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(restoreProduct).toHaveBeenCalledExactlyOnceWith('41401');
    expect(rows()).toHaveLength(2);
    expect(within(rows()[0]).getByRole('button', { name: /restaurando/i })).toBeDisabled();
    expect(restoreButton(rows()[1])).toBeEnabled();
    expect(
      screen.queryByText(/voltou à vitrine|devolvido à vitrine|suspensão removida/i),
    ).not.toBeInTheDocument();
    vi.mocked(listSuspended).mockResolvedValue(page([product('41402')]));
    await act(async () => pending.resolve({ productId: '41401', status: 'ativo' }));
    await waitFor(() => expect(rows()).toHaveLength(1));
  });

  it('retorno ativo informa volta à vitrine e preserva os demais cartões', async () => {
    renderQueue();
    await screen.findByText('Peça 41401');
    vi.mocked(listSuspended).mockResolvedValue(page([product('41402')]));
    await userEvent.setup().click(restoreButton(rows()[0]));
    await waitFor(() => expect(screen.queryByText('Peça 41401')).not.toBeInTheDocument());
    expect(screen.getByText('Peça 41402')).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('status')
        .some((node) => /voltou à vitrine|devolvido à vitrine/i.test(node.textContent ?? '')),
    ).toBe(true);
  });

  it('retorno despublicado informa suspensão removida e pausa do vendedor, sem prometer vitrine', async () => {
    vi.mocked(restoreProduct).mockResolvedValue({ productId: '41401', status: 'despublicado' });
    renderQueue();
    await screen.findByText('Peça 41401');
    vi.mocked(listSuspended).mockResolvedValue(page([product('41402')]));
    await userEvent.setup().click(restoreButton(rows()[0]));
    await waitFor(() => expect(screen.queryByText('Peça 41401')).not.toBeInTheDocument());
    const feedback = screen
      .getAllByRole('status')
      .map((node) => node.textContent)
      .join(' ');
    expect(feedback).toMatch(/suspensão removida/i);
    expect(feedback).toMatch(/pausad.*vendedor/i);
    expect(feedback).not.toMatch(/voltou à vitrine|devolvido à vitrine/i);
  });

  it.each([
    new AdminModerationError('NO_IMAGE', 'Dados inválidos.', 422, 'VALIDATION_ERROR', {
      images: 'Ao menos uma foto é necessária para restaurar.',
    }),
    new AdminModerationError('VALIDATION_ERROR', 'Dados inválidos.', 422, 'VALIDATION_ERROR', {
      images: 'Ao menos uma foto é necessária para restaurar.',
    }),
  ])('restauração sem foto explica a recusa e mantém o cartão: %#', async (error) => {
    vi.mocked(restoreProduct).mockRejectedValue(error);
    renderQueue();
    await screen.findByText('Peça 41401');
    await userEvent.setup().click(restoreButton(rows()[0]));
    expect(await within(rows()[0]).findByRole('alert')).toHaveTextContent(
      /ao menos uma foto|pelo menos uma foto/i,
    );
    expect(rows()).toHaveLength(2);
    expect(restoreButton(rows()[0])).toBeEnabled();
    expect(screen.queryByText(/voltou à vitrine/i)).not.toBeInTheDocument();
  });

  it('outro 422 mostra validação sem atribuí-la a foto ausente', async () => {
    vi.mocked(restoreProduct).mockRejectedValue(
      new AdminModerationError(
        'VALIDATION_ERROR',
        'Os dados da peça precisam ser corrigidos.',
        422,
        'VALIDATION_ERROR',
        { status: 'Estado inválido.' },
      ),
    );
    renderQueue();
    await screen.findByText('Peça 41401');
    await userEvent.setup().click(restoreButton(rows()[0]));
    const alert = await within(rows()[0]).findByRole('alert');
    expect(alert).toHaveTextContent(/dados|estado/i);
    expect(alert).not.toHaveTextContent(/foto/i);
    expect(rows()).toHaveLength(2);
  });

  it('falha genérica permite tentar de novo sem remover antecipadamente o item', async () => {
    vi.mocked(restoreProduct).mockRejectedValueOnce(new Error('rede'));
    renderQueue();
    await screen.findByText('Peça 41401');
    const user = userEvent.setup();
    await user.click(restoreButton(rows()[0]));
    expect(await within(rows()[0]).findByRole('alert')).toHaveTextContent(
      /restaurar|conexão|tente novamente/i,
    );
    expect(rows()).toHaveLength(2);
    vi.mocked(listSuspended).mockResolvedValue(page([product('41402')]));
    await user.click(restoreButton(rows()[0]));
    await waitFor(() => expect(screen.queryByText('Peça 41401')).not.toBeInTheDocument());
    expect(restoreProduct).toHaveBeenCalledTimes(2);
  });

  it('foco permanece no conteúdo após remover um cartão por teclado', async () => {
    renderQueue();
    await screen.findByText('Peça 41401');
    const button = restoreButton(rows()[0]);
    button.focus();
    vi.mocked(listSuspended).mockResolvedValue(page([product('41402')]));
    await userEvent.setup().keyboard('{Enter}');
    await waitFor(() => expect(button).not.toBeInTheDocument());
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole('main').contains(document.activeElement)).toBe(true);
  });

  it('restaurar o último cartão mostra estado vazio e preserva foco útil', async () => {
    vi.mocked(listSuspended)
      .mockResolvedValueOnce(page([product('41401')]))
      .mockResolvedValue(page([]));
    renderQueue();
    await screen.findByText('Peça 41401');
    restoreButton(rows()[0]).focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(await screen.findByText(/nenhum anúncio suspenso/i)).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole('main').contains(document.activeElement)).toBe(true);
  });

  it('falha de atualização após sucesso avisa e preserva os demais cartões', async () => {
    renderQueue();
    await screen.findByText('Peça 41401');
    vi.mocked(listSuspended).mockRejectedValue(new Error('rede na reconciliação'));
    await userEvent.setup().click(restoreButton(rows()[0]));
    await waitFor(() => expect(screen.queryByText('Peça 41401')).not.toBeInTheDocument());
    expect(screen.getByText('Peça 41402')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/atualizar|atualização/i);
    vi.mocked(listSuspended).mockResolvedValue(page([product('41402')]));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(restoreProduct).toHaveBeenCalledTimes(1);
  });
});
