// src/pages/onboarding/StyleSelection.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StyleSelection from './StyleSelection';
import { getStyles, savePreferences } from '@/services/preferenceService';

vi.mock('@/services/preferenceService', () => ({
  getStyles: vi.fn(),
  savePreferences: vi.fn(),
}));

const mockStyles = [
  { type: 'estilo', value: 'casual', label: 'Casual', description: 'Peças do dia a dia' },
  { type: 'estilo', value: 'vintage', label: 'Vintage', description: 'Achados de outra época' },
];

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/onboarding']}>
      <Routes>
        <Route path="/onboarding" element={<StyleSelection />} />
        <Route path="/" element={<h1>Início</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(savePreferences).mockReset().mockResolvedValue(undefined);
});

describe('StyleSelection', () => {
  it('renderiza a lista de estilos vinda do service', async () => {
    vi.mocked(getStyles).mockResolvedValue(mockStyles);

    renderScreen();

    await waitFor(() => {
      expect(screen.getByText('Casual')).toBeInTheDocument();
      expect(screen.getByText('Vintage')).toBeInTheDocument();
    });
  });

  it('marca o card ao selecionar um estilo', async () => {
    vi.mocked(getStyles).mockResolvedValue(mockStyles);
    const user = userEvent.setup();

    renderScreen();

    const checkbox = await screen.findByRole('checkbox', { name: /casual/i });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('mostra a descrição de cada estilo, que o backend já devolve', async () => {
    vi.mocked(getStyles).mockResolvedValue(mockStyles);
    renderScreen();

    expect(await screen.findByText('Peças do dia a dia')).toBeInTheDocument();
  });

  it('salvar grava as preferências selecionadas e vai pra home', async () => {
    vi.mocked(getStyles).mockResolvedValue(mockStyles);
    const user = userEvent.setup();
    renderScreen();

    const checkbox = await screen.findByRole('checkbox', { name: /vintage/i });
    await user.click(checkbox);

    await user.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith([{ type: 'estilo', value: 'vintage' }]);
    });
    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument();
  });

  it('pular avança sem gravar preferências e sem erro', async () => {
    vi.mocked(getStyles).mockResolvedValue(mockStyles);
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Pular' }));

    expect(savePreferences).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument();
  });

  it('sem seleção, o botão principal também avança sem gravar (nada para salvar)', async () => {
    vi.mocked(getStyles).mockResolvedValue(mockStyles);
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /abrir meu feed/i }));

    expect(savePreferences).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument();
  });

  it('se salvar falhar, ainda assim segue para a home (falha não pode travar a navegação)', async () => {
    vi.mocked(getStyles).mockResolvedValue(mockStyles);
    vi.mocked(savePreferences).mockRejectedValue(new Error('falhou'));
    const user = userEvent.setup();
    renderScreen();

    const checkbox = await screen.findByRole('checkbox', { name: /vintage/i });
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument();
    });
  });
});
