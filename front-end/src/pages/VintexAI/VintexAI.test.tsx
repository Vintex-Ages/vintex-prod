import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VintexAI from './VintexAI';
import * as vintexAiService from '@/services/vintexAiService';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPage(initialEntries: Array<{ pathname: string; state?: unknown }> = [{ pathname: '/vintex' }]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <VintexAI />
    </MemoryRouter>,
  );
}

describe('VintexAI page', () => {
  it('renderiza o cabeçalho com botão de voltar e título', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    expect(screen.getByText('Conversa com a Vintex')).toBeInTheDocument();
  });

  it('um chip de sugestão preenche o campo de busca', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Look para um jantar' }));

    expect(screen.getByRole('textbox', { name: 'Buscar' })).toHaveValue('Look para um jantar');
  });

  it('enviar uma mensagem adiciona a bolha do usuário e, depois, a resposta da Vintex', async () => {
    vi.spyOn(vintexAiService, 'getOutfitSuggestion').mockResolvedValue({
      id: 'reply-1',
      role: 'vintex',
      timestamp: 'agora',
      text: 'Resposta mockada de teste.',
    });

    renderPage();

    const input = screen.getByRole('textbox', { name: 'Buscar' });
    fireEvent.change(input, { target: { value: 'quero um look de festa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar busca' }));

    expect(screen.getByText('quero um look de festa')).toBeInTheDocument();
    expect(input).toHaveValue('');

    await waitFor(() => {
      expect(screen.getByText('Resposta mockada de teste.')).toBeInTheDocument();
    });

    expect(vintexAiService.getOutfitSuggestion).toHaveBeenCalledWith('quero um look de festa');
  });

  it('mostra a mensagem recebida via navegação (location.state) como primeira bolha', async () => {
    vi.spyOn(vintexAiService, 'getOutfitSuggestion').mockResolvedValue({
      id: 'reply-2',
      role: 'vintex',
      timestamp: 'agora',
      text: 'Ok, montei uma sugestão!',
    });

    renderPage([{ pathname: '/vintex', state: { message: 'look de inverno' } }]);

    expect(screen.getByText('look de inverno')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Ok, montei uma sugestão!')).toBeInTheDocument();
    });
  });

  it('mostra uma mensagem de erro na conversa se o service falhar', async () => {
    vi.spyOn(vintexAiService, 'getOutfitSuggestion').mockRejectedValue(new Error('falhou'));

    renderPage();

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar' }), {
      target: { value: 'algo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar busca' }));

    await waitFor(() => {
      expect(
        screen.getByText('Não consegui responder agora. Tenta de novo em instantes?'),
      ).toBeInTheDocument();
    });
  });
});
