import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VintexAI from './VintexAI';
import * as vintexAiService from '@/services/vintexAiService';
import type { ChatChunk } from '@/types/vintex-ai';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Fila de chunks com um pequeno atraso real entre cada um. */
function fakeChat(chunks: ChatChunk[], delayMs = 10) {
  return vi.spyOn(vintexAiService, 'chat').mockImplementation(async function* (request) {
    for (const chunk of chunks) {
      if (request.signal?.aborted) return;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (request.signal?.aborted) return;
      yield chunk;
    }
  });
}

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
    fakeChat([{ type: 'done' }]);
    renderPage();

    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
    expect(screen.getByText('Conversa com a Vintex')).toBeInTheDocument();
  });

  it('um chip de sugestão preenche o campo de busca', () => {
    fakeChat([{ type: 'done' }]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Look para um jantar' }));

    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue('Look para um jantar');
  });

  it('enviar uma mensagem adiciona a bolha do usuário e a resposta cresce em streaming até done', async () => {
    fakeChat([
      { type: 'text', delta: 'Entendi' },
      { type: 'text', delta: ' seu pedido.' },
      { type: 'done' },
    ]);

    renderPage();

    const input = screen.getByRole('searchbox', { name: 'Buscar' });
    fireEvent.change(input, { target: { value: 'quero um look de festa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(screen.getByText('quero um look de festa')).toBeInTheDocument();
    expect(input).toHaveValue('');

    await waitFor(() => {
      expect(screen.getByText('Entendi seu pedido.')).toBeInTheDocument();
    });
    expect(vintexAiService.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', text: 'quero um look de festa' }],
      }),
    );
  });

  it('mostra a mensagem recebida via navegação (location.state) e já dispara o envio', async () => {
    fakeChat([{ type: 'text', delta: 'Ok, montei uma sugestão!' }, { type: 'done' }]);

    renderPage([{ pathname: '/vintex', state: { message: 'look de inverno' } }]);

    expect(screen.getByText('look de inverno')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Ok, montei uma sugestão!')).toBeInTheDocument();
    });
  });

  it('error no stream mostra a mensagem e o botão de retry, que reenvia e funciona', async () => {
    fakeChat([
      { type: 'text', delta: 'x' },
      { type: 'error', message: 'Falha de rede.' },
    ]);

    renderPage();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'algo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(screen.getByText('Falha de rede.')).toBeInTheDocument();
    });

    fakeChat([{ type: 'text', delta: 'Agora funcionou.' }, { type: 'done' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => {
      expect(screen.getByText('Agora funcionou.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Falha de rede.')).not.toBeInTheDocument();
  });

  it('desmontar a tela aborta o stream em andamento', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(vintexAiService, 'chat').mockImplementation(async function* (request) {
      capturedSignal = request.signal;
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (request.signal?.aborted) return;
      yield { type: 'text', delta: 'não deveria aparecer' };
    });

    const { unmount } = renderPage();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'algo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('chegando de outra tela (com histórico), o "Voltar" volta uma página em vez de ir pra home', async () => {
    fakeChat([{ type: 'done' }]);
    render(
      <MemoryRouter initialEntries={['/origem', '/vintex']} initialIndex={1}>
        <Routes>
          <Route path="/vintex" element={<VintexAI />} />
          <Route path="/origem" element={<h1>Tela de origem</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(await screen.findByRole('heading', { name: 'Tela de origem' })).toBeInTheDocument();
  });

  it('clicar em "Ver peça" de um produto na resposta navega para o detalhe dele', async () => {
    const product = {
      id: 'p1',
      name: 'Vestido floral',
      price: 89.9,
      coverImageUrl: null,
      store: { id: 's1', name: 'Brechó Ana' },
    };
    fakeChat([{ type: 'products', products: [product] }, { type: 'done' }]);

    render(
      <MemoryRouter initialEntries={['/vintex']}>
        <Routes>
          <Route path="/vintex" element={<VintexAI />} />
          <Route path="/product/:id" element={<h1>Detalhe da peça</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'vestido' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    const link = await screen.findByRole('link', { name: 'Ver peça: Vestido floral' });
    fireEvent.click(link);

    expect(await screen.findByRole('heading', { name: 'Detalhe da peça' })).toBeInTheDocument();
  });

  it('entrando por URL direta, o "Voltar" leva para a home', async () => {
    fakeChat([{ type: 'done' }]);
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
