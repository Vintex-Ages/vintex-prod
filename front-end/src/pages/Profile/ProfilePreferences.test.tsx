import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/context/ToastContext';
import { getPreferences, getStyles, savePreferences } from '@/services/preferenceService';
import type { Preference, StyleOption } from '@/types/preference';
import ProfilePreferences from './ProfilePreferences';

vi.mock('@/services/preferenceService', () => ({
  getStyles: vi.fn(),
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
}));

const mockStyles: StyleOption[] = [
  {
    type: 'estilo',
    value: 'vintage-80-90',
    label: 'Vintage 80s / 90s',
    description: 'Jaquetas de couro, jeans pesados e peças históricas',
  },
  {
    type: 'estilo',
    value: 'streetwear',
    label: 'Streetwear Urbano',
    description: 'Oversized, moletons gráficos e sneakers raros',
  },
  {
    type: 'estilo',
    value: 'alfaiataria',
    label: 'Alfaiataria & Elegância',
    description: 'Blazers estruturados, camisas de seda e cortes clássicos',
  },
];

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/profile/preferences']}>
      <ToastProvider>
        <ProfilePreferences />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function mockLoadedPage(preferences: Preference[] = []) {
  vi.mocked(getStyles).mockResolvedValue(mockStyles);
  vi.mocked(getPreferences).mockResolvedValue(preferences);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadedPage();
  vi.mocked(savePreferences).mockResolvedValue(undefined);
});

describe('<ProfilePreferences />', () => {
  it('carrega os estilos disponíveis e as preferências atuais ao abrir a página', async () => {
    renderPage();

    await waitFor(() => {
      expect(getStyles).toHaveBeenCalledTimes(1);
      expect(getPreferences).toHaveBeenCalledTimes(1);
    });
  });

  it('exibe os estilos previamente selecionados', async () => {
    mockLoadedPage([
      { type: 'estilo', value: 'vintage-80-90' },
      { type: 'estilo', value: 'alfaiataria' },
    ]);

    renderPage();

    expect(await screen.findByRole('checkbox', { name: /vintage 80s/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /alfaiataria/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /streetwear/i })).not.toBeChecked();
  });

  it('permite marcar e desmarcar estilos', async () => {
    mockLoadedPage([{ type: 'estilo', value: 'vintage-80-90' }]);
    const user = userEvent.setup();

    renderPage();

    const vintage = await screen.findByRole('checkbox', { name: /vintage 80s/i });
    const streetwear = screen.getByRole('checkbox', { name: /streetwear/i });

    await user.click(streetwear);
    await user.click(vintage);

    expect(streetwear).toBeChecked();
    expect(vintage).not.toBeChecked();
  });

  it('salva a seleção completa, substituindo as preferências anteriores', async () => {
    mockLoadedPage([{ type: 'estilo', value: 'vintage-80-90' }]);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: /streetwear/i }));
    await user.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(1));

    const savedPreferences = vi.mocked(savePreferences).mock.calls[0][0];
    expect(savedPreferences).toHaveLength(2);
    expect(savedPreferences).toEqual(
      expect.arrayContaining([
        { type: 'estilo', value: 'vintage-80-90' },
        { type: 'estilo', value: 'streetwear' },
      ]),
    );
  });

  it('salva uma lista vazia ao remover todos os estilos', async () => {
    mockLoadedPage([{ type: 'estilo', value: 'vintage-80-90' }]);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: /vintage 80s/i }));
    await user.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => expect(savePreferences).toHaveBeenCalledWith([]));
    expect(savePreferences).toHaveBeenCalledTimes(1);
  });

  it('mantém o botão de salvar funcional quando nenhum estilo está selecionado', async () => {
    const user = userEvent.setup();

    renderPage();

    const saveButton = await screen.findByRole('button', { name: /salvar/i });
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() => expect(savePreferences).toHaveBeenCalledWith([]));
  });

  it('não permite salvar enquanto os dados estão carregando', async () => {
    const stylesRequest = deferred<StyleOption[]>();
    const preferencesRequest = deferred<Preference[]>();
    vi.mocked(getStyles).mockReturnValue(stylesRequest.promise);
    vi.mocked(getPreferences).mockReturnValue(preferencesRequest.promise);
    const user = userEvent.setup();

    renderPage();

    await waitFor(() => {
      expect(getStyles).toHaveBeenCalledTimes(1);
      expect(getPreferences).toHaveBeenCalledTimes(1);
    });

    const saveButton = screen.queryByRole('button', { name: /salvar/i });
    if (saveButton) {
      expect(saveButton).toBeDisabled();
      await user.click(saveButton);
    }
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it('mostra ErrorState em falhas de carregamento e permite tentar novamente', async () => {
    vi.mocked(getStyles)
      .mockRejectedValueOnce(new Error('falha ao carregar estilos'))
      .mockResolvedValueOnce(mockStyles);
    vi.mocked(getPreferences)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ type: 'estilo', value: 'streetwear' }]);
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(await screen.findByRole('checkbox', { name: /streetwear/i })).toBeChecked();
    expect(getStyles).toHaveBeenCalledTimes(2);
    expect(getPreferences).toHaveBeenCalledTimes(2);
  });

  it('preserva a seleção e permite tentar novamente quando o salvamento falha', async () => {
    mockLoadedPage([{ type: 'estilo', value: 'vintage-80-90' }]);
    vi.mocked(savePreferences)
      .mockRejectedValueOnce(new Error('falha ao salvar'))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    renderPage();

    const vintage = await screen.findByRole('checkbox', { name: /vintage 80s/i });
    const saveButton = screen.getByRole('button', { name: /salvar/i });
    await user.click(saveButton);

    await waitFor(() => expect(saveButton).toBeEnabled());
    expect(vintage).toBeChecked();

    await user.click(saveButton);

    await waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(2));
    expect(savePreferences).toHaveBeenLastCalledWith([{ type: 'estilo', value: 'vintage-80-90' }]);
  });

  it('apresenta feedback acessível pelo sistema de toast após salvar com sucesso', async () => {
    mockLoadedPage([{ type: 'estilo', value: 'streetwear' }]);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: /salvar/i }));

    const feedback = await screen.findByRole('status');
    expect(feedback).toHaveTextContent(/preferências.*salv/i);
  });

  it('desabilita o botão enquanto salva para evitar chamadas duplicadas', async () => {
    const saveRequest = deferred<void>();
    vi.mocked(savePreferences).mockReturnValue(saveRequest.promise);
    const user = userEvent.setup();

    renderPage();

    const saveButton = await screen.findByRole('button', { name: /salvar/i });
    await user.click(saveButton);

    expect(saveButton).toBeDisabled();
    await user.click(saveButton);
    expect(savePreferences).toHaveBeenCalledTimes(1);

    saveRequest.resolve();
    await waitFor(() => expect(saveButton).toBeEnabled());
  });
});
