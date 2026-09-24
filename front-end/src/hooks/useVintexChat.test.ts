import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useVintexChat } from './useVintexChat';
import * as vintexAiService from '@/services/vintexAiService';
import type { ChatChunk } from '@/types/vintex-ai';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Fila controlável de chunks, com um pequeno atraso real entre cada um. */
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

describe('useVintexChat', () => {
  it('enviar uma mensagem cria a bolha do usuário e uma bolha da Vintex em streaming, que cresce a cada chunk', async () => {
    fakeChat([
      { type: 'text', delta: 'Enten' },
      { type: 'text', delta: 'di seu pedido.' },
      { type: 'done' },
    ]);

    const { result } = renderHook(() => useVintexChat());

    act(() => {
      result.current.sendMessage('quero um look de festa');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      text: 'quero um look de festa',
    });
    expect(result.current.streamingMessageId).toBe(result.current.messages[1].id);

    await waitFor(() => {
      expect(result.current.messages[1].text).toBe('Entendi seu pedido.');
    });

    // termina em done: streaming desliga, sem bolha de erro.
    await waitFor(() => {
      expect(result.current.streamingMessageId).toBeNull();
    });
    expect(result.current.errorMessageId).toBeNull();
  });

  it('chunk products/interpreted preenchem os campos da mesma mensagem', async () => {
    const product = {
      id: 'p1',
      name: 'Vestido floral',
      price: 89.9,
      coverImageUrl: null,
      store: { id: 's1', name: 'Brechó Ana' },
    };
    fakeChat([
      { type: 'text', delta: 'Olha essas peças.' },
      { type: 'products', products: [product] },
      { type: 'interpreted', interpreted: { filters: { category: 'Vestidos' } } },
      { type: 'done' },
    ]);

    const { result } = renderHook(() => useVintexChat());
    act(() => {
      result.current.sendMessage('vestido floral');
    });

    await waitFor(() => {
      expect(result.current.messages[1].products).toEqual([product]);
    });
    expect(result.current.messages[1].interpreted).toEqual({ filters: { category: 'Vestidos' } });
  });

  it('error no stream mostra a mensagem na bolha e desliga o streaming, sem done', async () => {
    fakeChat([
      { type: 'text', delta: 'Espera' },
      { type: 'error', message: 'A Vintex não respondeu a tempo.' },
    ]);

    const { result } = renderHook(() => useVintexChat());
    act(() => {
      result.current.sendMessage('algo');
    });

    const vintexId = result.current.messages[1].id;

    await waitFor(() => {
      expect(result.current.errorMessageId).toBe(vintexId);
    });
    expect(result.current.errorText).toBe('A Vintex não respondeu a tempo.');
    expect(result.current.streamingMessageId).toBeNull();
  });

  it('retry reenvia a última pergunta, reaproveitando a mesma bolha (mesmo id)', async () => {
    fakeChat([
      { type: 'text', delta: 'Falhou' },
      { type: 'error', message: 'Falha de rede.' },
    ]);

    const { result } = renderHook(() => useVintexChat());
    act(() => {
      result.current.sendMessage('bolsa vermelha');
    });

    const vintexId = result.current.messages[1].id;
    await waitFor(() => expect(result.current.errorMessageId).toBe(vintexId));

    fakeChat([{ type: 'text', delta: 'Agora funcionou.' }, { type: 'done' }]);

    act(() => {
      result.current.retry();
    });

    expect(result.current.errorMessageId).toBeNull();
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].id).toBe(vintexId);

    await waitFor(() => {
      expect(result.current.messages[1].text).toBe('Agora funcionou.');
    });
    expect(vintexAiService.chat).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', text: 'bolsa vermelha' }],
      }),
    );
  });

  it('enviar uma nova pergunta aborta o stream anterior, que não escreve mais nada', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(vintexAiService, 'chat').mockImplementation(async function* (request) {
      capturedSignal = request.signal;
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (request.signal?.aborted) return;
      yield { type: 'text', delta: 'não deveria aparecer' };
    });

    const { result } = renderHook(() => useVintexChat());
    act(() => {
      result.current.sendMessage('primeira pergunta');
    });

    fakeChat([{ type: 'text', delta: 'segunda resposta' }, { type: 'done' }]);
    act(() => {
      result.current.sendMessage('segunda pergunta');
    });

    expect(capturedSignal?.aborted).toBe(true);

    await waitFor(() => {
      expect(result.current.messages[3]?.text).toBe('segunda resposta');
    });
    expect(result.current.messages.some((m) => m.text.includes('não deveria aparecer'))).toBe(
      false,
    );
  });

  it('histórico enviado ao service inclui as mensagens anteriores da conversa', async () => {
    const spy = fakeChat([{ type: 'text', delta: 'ok' }, { type: 'done' }]);

    const { result } = renderHook(() => useVintexChat());
    act(() => {
      result.current.sendMessage('primeira');
    });
    await waitFor(() => expect(result.current.streamingMessageId).toBeNull());

    act(() => {
      result.current.sendMessage('segunda');
    });

    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', text: 'primeira' },
          { role: 'vintex', text: 'ok' },
          { role: 'user', text: 'segunda' },
        ],
      }),
    );
  });

  it('desmontar o hook aborta o stream em andamento', async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.spyOn(vintexAiService, 'chat').mockImplementation(async function* (request) {
      capturedSignal = request.signal;
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (request.signal?.aborted) return;
      yield { type: 'text', delta: 'x' };
    });

    const { result, unmount } = renderHook(() => useVintexChat());
    act(() => {
      result.current.sendMessage('algo');
    });

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('ignora mensagem em branco, sem criar bolhas nem chamar o service', () => {
    const spy = fakeChat([{ type: 'done' }]);
    const { result } = renderHook(() => useVintexChat());

    act(() => {
      result.current.sendMessage('   ');
    });

    expect(result.current.messages).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('retry sem nenhuma mensagem enviada antes não faz nada', () => {
    const spy = fakeChat([{ type: 'done' }]);
    const { result } = renderHook(() => useVintexChat());

    act(() => {
      result.current.retry();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('aceita uma mensagem inicial (vinda da navegação) e já dispara o envio', async () => {
    fakeChat([{ type: 'text', delta: 'oi' }, { type: 'done' }]);

    const { result } = renderHook(() => useVintexChat('mensagem inicial'));

    expect(result.current.messages[0]).toMatchObject({
      role: 'user',
      text: 'mensagem inicial',
    });

    await waitFor(() => expect(result.current.messages[1]?.text).toBe('oi'));
  });
});
