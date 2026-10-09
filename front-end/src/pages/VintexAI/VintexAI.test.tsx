import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import VintexAI from './VintexAI';
import * as vintexAiService from '@/services/vintexAiService';
import { resetVintexChat } from '@/hooks/useVintexChat';
import { products as mockProducts } from '@/mocks/products';
import type { ChatChunk } from '@/types/vintex-ai';

beforeEach(() => {
  resetVintexChat();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetVintexChat();
});

/**
 * Fila de chunks com um pequeno atraso real entre cada um. Implementa o
 * protocolo de iterador assíncrono na mão (sem `async function*`)
 * algumas versões do Vitest não mockam geradores async corretamente via
 * `mockImplementation`.
 */
function fakeChat(chunks: ChatChunk[], delayMs = 10) {
  return vi.spyOn(vintexAiService, 'chat').mockImplementation((request) => {
    let index = 0;
    const iterator = {
      [Symbol.asyncIterator]() {
        return iterator;
      },
      async next(): Promise<IteratorResult<ChatChunk>> {
        if (request.signal?.aborted || index >= chunks.length) {
          return { done: true, value: undefined };
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (request.signal?.aborted) {
          return { done: true, value: undefined };
        }
        const value = chunks[index];
        index += 1;
        return { done: false, value };
      },
      async return(value?: unknown): Promise<IteratorResult<ChatChunk>> {
        return { done: true, value: value as ChatChunk };
      },
      async throw(error?: unknown): Promise<IteratorResult<ChatChunk>> {
        throw error;
      },
    };
    return iterator as AsyncGenerator<ChatChunk>;
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

  it('um chip de sugestão preenche o campo de mensagem', () => {
    fakeChat([{ type: 'done' }]);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Manter cor prata' }));

    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveValue(
      'Quero alternativas na cor prata',
    );
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

  /**
   * #209: sair de /vintex pra ver o detalhe de uma peça não pode perder a
   * conversa nem cortar uma resposta que ainda está chegando ela termina
   * em segundo plano, e a tela volta a mostrar tudo, já completo, quando o
   * usuário retorna. Contrário do que valia no #208 (lá, desmontar abortava).
   */
  it('sair da tela não aborta o stream: ele termina em segundo plano e, ao voltar, a conversa continua onde estava', async () => {
    fakeChat([{ type: 'text', delta: 'resposta completa' }, { type: 'done' }], 15);

    const { unmount } = renderPage();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'algo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    unmount();

    // Ninguém montado escutando, mas o stream segue rodando por trás.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    renderPage();

    expect(screen.getByText('algo')).toBeInTheDocument();
    expect(screen.getByText('resposta completa')).toBeInTheDocument();
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

  it('ao voltar do detalhe da peça pra /vintex, a conversa (incluindo a peça) continua lá', async () => {
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
    await screen.findByRole('heading', { name: 'Detalhe da peça' });

    // "Voltar" da tela do detalhe é fora do escopo desta issue (é da tela
    // de produto) aqui simulamos com desmontar/montar de novo, que é
    // exatamente o que acontece por trás quando a rota muda.
    cleanup();
    renderPage();

    expect(screen.getByText('vestido')).toBeInTheDocument();
    expect(screen.getByText('Vestido floral')).toBeInTheDocument();
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
  /**
   * O ponto de entrada da Home/Catálogo (#207) navega para cá com a pergunta
   * em `location.state`. O disparo era guardado por um booleano módulo-escopado
   * que nunca voltava a `false`, então a segunda entrada pelo campo era
   * descartada em silêncio: aparecia a conversa antiga e a pergunta nova não
   * chegava ao service. Agora a guarda é a `location.key`, única por navegação.
   */
  it('entrar pelo campo da Home duas vezes envia as duas perguntas', async () => {
    const spy = fakeChat([{ type: 'done' }]);

    function EntradaStub() {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate('/vintex', { state: { message: 'look de inverno' } })}>
            primeira
          </button>
          <button onClick={() => navigate('/vintex', { state: { message: 'bota de cano curto' } })}>
            segunda
          </button>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<EntradaStub />} />
          <Route path="/vintex" element={<VintexAI />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'primeira' }));
    expect(await screen.findByText('look de inverno')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'segunda' }));

    expect(await screen.findByText('bota de cano curto')).toBeInTheDocument();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  // FE-US027-3 — objetivo declarado: garantir a ponte com a VS-009.
  it('o chunk interpreted vira chips, e "Ver no catálogo" abre a busca com os mesmos filtros', async () => {
    fakeChat([
      { type: 'text', delta: 'Separei algumas opções.' },
      {
        type: 'interpreted',
        interpreted: {
          filters: { category: 'Casacos', color: 'Preto', priceMax: 100 },
          similarity: 'streetwear',
        },
      },
      { type: 'done' },
    ]);

    function CatalogProbe() {
      const { search } = useLocation();
      return <h1>Catálogo {search}</h1>;
    }

    render(
      <MemoryRouter initialEntries={['/vintex']}>
        <Routes>
          <Route path="/vintex" element={<VintexAI />} />
          <Route path="/catalog" element={<CatalogProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'casaco preto até 100 estilo streetwear' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    const entendeu = await screen.findByRole('region', {
      name: 'Como a Vintex entendeu seu pedido',
    });
    expect(entendeu).toHaveTextContent('Casacos');
    expect(entendeu).toHaveTextContent('Preto');
    expect(entendeu).toHaveTextContent('até R$ 100,00');
    expect(entendeu).toHaveTextContent('parecido com: streetwear');

    fireEvent.click(screen.getByRole('button', { name: 'Ver no catálogo' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Catálogo ?category=Casacos&color=Preto&priceMax=100',
      }),
    ).toBeInTheDocument();
  });

  it('sem interpreted, a resposta não mostra a interpretação', async () => {
    fakeChat([{ type: 'text', delta: 'Oi!' }, { type: 'done' }]);
    renderPage();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
      target: { value: 'oi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await screen.findByText('Oi!');
    expect(screen.queryByRole('region', { name: 'Como a Vintex entendeu seu pedido' })).toBeNull();
  });

  // FE-US027-5 (#357): cota do dia do chat esgotada.
  describe('cota do dia esgotada', () => {
    const AVISO_COTA = 'Você atingiu o limite de perguntas por hoje.';

    function perguntar(pergunta: string) {
      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
        target: { value: pergunta },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    }

    it('mostra o aviso como status, sem "Tentar de novo", e trava o envio', async () => {
      fakeChat([{ type: 'error', reason: 'quota', message: AVISO_COTA }]);
      renderPage();
      perguntar('saia');

      expect(await screen.findByRole('status')).toHaveTextContent(AVISO_COTA);
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();

      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
        target: { value: 'outra pergunta' },
      });
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    });

    it('erro comum (503) continua com "Tentar de novo" e o envio liberado', async () => {
      fakeChat([{ type: 'error', message: 'Falha ao conectar com a Vintex (HTTP 503).' }]);
      renderPage();
      perguntar('saia');

      expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
      expect(screen.queryByRole('status')).toBeNull();

      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
        target: { value: 'outra pergunta' },
      });
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
    });

    it('recomeçar a conversa libera o envio de novo', async () => {
      fakeChat([{ type: 'error', reason: 'quota', message: AVISO_COTA }]);
      renderPage();
      perguntar('saia');
      await screen.findByRole('status');

      fireEvent.click(screen.getByRole('button', { name: 'Recomeçar conversa' }));
      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
        target: { value: 'outra pergunta' },
      });

      expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
    });

    it('uma pergunta nova que chega pela Home limpa o aviso de cota', async () => {
      fakeChat([{ type: 'error', reason: 'quota', message: AVISO_COTA }]);

      function EntradaStub() {
        const navigate = useNavigate();
        return (
          <button onClick={() => navigate('/vintex', { state: { message: 'bota' } })}>
            perguntar
          </button>
        );
      }

      render(
        <MemoryRouter initialEntries={['/vintex']}>
          <Routes>
            <Route path="/" element={<EntradaStub />} />
            <Route path="/vintex" element={<VintexAI />} />
          </Routes>
        </MemoryRouter>,
      );
      perguntar('saia');
      await screen.findByRole('status');

      fakeChat([{ type: 'text', delta: 'Achei botas.' }, { type: 'done' }], 30);
      fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
      fireEvent.click(await screen.findByRole('button', { name: 'perguntar' }));

      // Ainda em streaming, antes de qualquer chunk: o aviso já saiu.
      await screen.findByText('bota');
      expect(screen.queryByRole('status')).toBeNull();
      // A bolha de cota antiga volta a ser neutra: nem aviso, nem retry.
      expect(screen.queryByText(AVISO_COTA)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
      expect(await screen.findByText('Achei botas.')).toBeInTheDocument();
    });

    it('pergunta nova (não retry) depois de um erro tira o erro e o retry da bolha antiga', async () => {
      fakeChat([{ type: 'error', message: 'Falha de rede.' }]);
      renderPage();
      perguntar('saia');
      await screen.findByRole('button', { name: 'Tentar de novo' });

      fakeChat([{ type: 'text', delta: 'Achei saias.' }, { type: 'done' }], 30);
      perguntar('saia longa');

      // Logo no envio, antes de qualquer chunk da resposta nova.
      expect(screen.queryByText('Falha de rede.')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
      expect(await screen.findByText('Achei saias.')).toBeInTheDocument();
      expect(screen.queryByText('Falha de rede.')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
    });
  });

  // #297: a API real da S2 não manda `text` (back-end#149) — a bolha nunca fica vazia.
  describe('resposta sem texto', () => {
    function perguntar(pergunta: string) {
      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), {
        target: { value: pergunta },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    }

    it('com peças, a frase de reserva diz quantas foram encontradas', async () => {
      fakeChat([{ type: 'products', products: mockProducts.slice(0, 2) }, { type: 'done' }]);
      renderPage();
      perguntar('vestido floral');

      expect(
        await screen.findByText('Encontrei 2 peças no catálogo que combinam com o que você pediu.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Buscar no catálogo' })).toBeNull();
    });

    it('sem peças, avisa e oferece buscar a pergunta no catálogo', async () => {
      fakeChat([{ type: 'products', products: [] }, { type: 'done' }]);

      function CatalogProbe() {
        const { search } = useLocation();
        return <h1>Catálogo {search}</h1>;
      }

      render(
        <MemoryRouter initialEntries={['/vintex']}>
          <Routes>
            <Route path="/vintex" element={<VintexAI />} />
            <Route path="/catalog" element={<CatalogProbe />} />
          </Routes>
        </MemoryRouter>,
      );
      perguntar('jaqueta de couro');

      expect(await screen.findByText('Não achei peças para isso agora.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Buscar no catálogo' }));

      expect(
        await screen.findByRole('heading', { name: 'Catálogo ?q=jaqueta+de+couro' }),
      ).toBeInTheDocument();
    });

    it('o texto do back prevalece sobre a frase de reserva', async () => {
      fakeChat([
        { type: 'text', delta: 'Olha estas.' },
        { type: 'products', products: [] },
        { type: 'done' },
      ]);
      renderPage();
      perguntar('saia');

      await screen.findByText('Olha estas.');
      await waitFor(() => expect(screen.queryByTestId('chat-bubble-streaming-cursor')).toBeNull());
      expect(screen.queryByText('Não achei peças para isso agora.')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Buscar no catálogo' })).toBeNull();
    });

    it('com erro, mostra o erro e não a frase de reserva', async () => {
      fakeChat([{ type: 'error', message: 'Falhou.' }]);
      renderPage();
      perguntar('saia');

      expect(await screen.findByText('Falhou.')).toBeInTheDocument();
      expect(screen.queryByText('Não achei peças para isso agora.')).toBeNull();
    });
  });
});
