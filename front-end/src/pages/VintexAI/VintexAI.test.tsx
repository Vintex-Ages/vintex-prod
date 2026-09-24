import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VintexAI from './VintexAI';
import * as vintexAiService from '@/services/vintexAiService';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderPage(
  initialEntries: Array<{ pathname: string; state?: unknown }> = [{ pathname: '/vintex' }],
) {
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

    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('Look para um jantar');
  });

  it('enviar uma mensagem adiciona a bolha do usuário e, depois, a resposta da Vintex', async () => {
    vi.spyOn(vintexAiService, 'getOutfitSuggestion').mockResolvedValue({
      id: 'reply-1',
      role: 'vintex',
      createdAt: 'agora',
      text: 'Resposta mockada de teste.',
    });

    renderPage();

    const input = screen.getByRole('searchbox', { name: 'Buscar' });
    fireEvent.change(input, { target: { value: 'quero um look de festa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

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
      createdAt: 'agora',
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

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'algo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(
        screen.getByText('Não consegui responder agora. Tenta de novo em instantes?'),
      ).toBeInTheDocument();
    });
  });
  /**
   * `/vintex` ganhou rota (#178): dá para chegar por URL direta e por refresh.
   * Nesse caso não há entrada anterior no histórico do app, e um
   * `history.back()` sairia do site.
   */
  it('entrando por URL direta, o "Voltar" leva para a home', async () => {
    render(
      <MemoryRouter initialEntries={['/vintex']}>
        <Routes>
          <Route path="/vintex" element={<VintexAI />} />
          <Route path="/" element={<h1>Feed de achados</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(await screen.findByRole('heading', { name: 'Feed de achados' })).toBeInTheDocument();
  });
});
