import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/context/ToastContext';
import {
  discardDraft,
  getMine,
  getSalesSummary,
  publish,
  SellerProductError,
  unpublish,
} from '@/services/sellerProductService';
import { getMyVerification, requestVerification } from '@/services/storeService';
import type { Paginated, SellerProduct } from '@/types/product';
import type { StoreProfile } from '@/types/store';
import SellerAdmin from './SellerAdmin';

vi.mock('@/services/sellerProductService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/sellerProductService')>()),
  getMine: vi.fn(),
  discardDraft: vi.fn(),
  getSalesSummary: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
}));

vi.mock('@/services/storeService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storeService')>()),
  getMyVerification: vi.fn(),
  requestVerification: vi.fn(),
}));

function peca(overrides: Partial<SellerProduct> = {}): SellerProduct {
  return {
    id: '1',
    name: 'Jaqueta jeans',
    price: 199.9,
    status: 'ativo',
    coverImageUrl: null,
    ...overrides,
  };
}

function pagina(items: SellerProduct[]): Paginated<SellerProduct> {
  return { items, page: 1, pageSize: 20, total: items.length };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/seller']}>
        <Routes>
          <Route path="/seller" element={<SellerAdmin />} />
          <Route path="/seller/products/new" element={<h1>Anunciar peça</h1>} />
          <Route path="/seller/store" element={<h1>Editar loja</h1>} />
          <Route path="/seller/products/:id" element={<h1>Formulário da peça</h1>} />
          <Route path="/seller/products/:id/review" element={<h1>Revisão da peça</h1>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMyVerification).mockResolvedValue('pendente');
  vi.mocked(getSalesSummary).mockImplementation(async (period) => ({
    period,
    soldCount: 0,
    gross: 0,
    commission: 0,
    net: 0,
  }));
});

describe('<SellerAdmin />', () => {
  it('mostra as contagens por status e a lista de peças', async () => {
    vi.mocked(getMine).mockResolvedValue(
      pagina([
        peca({ id: '1', name: 'Jaqueta jeans', status: 'ativo' }),
        peca({ id: '2', name: 'Camisa linho', status: 'ativo' }),
        peca({ id: '3', name: 'Bota Chelsea', status: 'vendido' }),
        peca({ id: '4', name: 'Bolsa palha', status: 'despublicado' }),
      ]),
    );

    renderPage();

    // O frame do Figma (T15) não tem os cartões Anunciadas/Vendidas/Pausadas.
    expect(await screen.findByText('4 peças no total')).toBeInTheDocument();
    expect(screen.queryByTestId('stat-anunciadas')).toBeNull();
    expect(screen.queryByTestId('stat-vendidas')).toBeNull();
    expect(screen.queryByTestId('stat-pausadas')).toBeNull();

    // As contagens aparecem na aba e nos filtros (frame ajustado do Figma, T15).
    expect(screen.getByRole('button', { name: 'Anunciadas (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendidas (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pausadas (1)' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Minhas Peças Cadastradas (4)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todas (4)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anunciadas (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendidas (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pausadas (1)' })).toBeInTheDocument();

    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();
    expect(screen.getByText('Bota Chelsea')).toBeInTheDocument();
  });

  // Issue #437 (frame ajustado T15): título do painel e só a aba de peças.
  it('mostra o título do frame e só a aba "Minhas Peças Cadastradas"', async () => {
    vi.mocked(getMine).mockResolvedValue(pagina([peca()]));

    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Painel de Vendas & Gestão de Peças' }),
    ).toBeInTheDocument();
    // Subtítulo com o texto exato do frame.
    expect(
      screen.getByText(
        'Acompanhe seus anúncios ativos, valores a receber via Pix e pedidos prontos para envio.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText('Jaqueta jeans')).toBeInTheDocument();
    // Não há rota no back para o vendedor ver Pedidos: a aba não aparece.
    expect(screen.queryByText(/Pedidos para Envio/i)).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('o filtro ativo fica marcado e a aba de rascunhos continua ao lado dos filtros', async () => {
    vi.mocked(getMine).mockResolvedValue(pagina([peca()]));

    renderPage();

    await screen.findByText('Jaqueta jeans');
    expect(screen.getByRole('button', { name: 'Todas (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Anunciadas (1)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Rascunhos' })).toBeInTheDocument();
  });

  it('filtra a lista por status sem chamar o serviço de novo', async () => {
    vi.mocked(getMine).mockResolvedValue(
      pagina([
        peca({ id: '1', name: 'Jaqueta jeans', status: 'ativo' }),
        peca({ id: '2', name: 'Bota Chelsea', status: 'vendido' }),
      ]),
    );
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Jaqueta jeans');
    expect(getMine).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Vendidas (1)' }));

    expect(screen.getByText('Bota Chelsea')).toBeInTheDocument();
    expect(screen.queryByText('Jaqueta jeans')).not.toBeInTheDocument();
    expect(getMine).toHaveBeenCalledTimes(1);
  });

  // docs/adr/0001 (#297): o back devolve rascunho na listagem sem filtro.
  it('rascunho não aparece na lista, nos cards nem no total', async () => {
    vi.mocked(getMine).mockResolvedValue(
      pagina([
        peca({ id: '1', name: 'Jaqueta jeans', status: 'ativo' }),
        peca({ id: '2', name: 'Saia abandonada', status: 'rascunho' }),
      ]),
    );

    renderPage();

    expect(await screen.findByText('Jaqueta jeans')).toBeInTheDocument();
    expect(screen.queryByText('Saia abandonada')).toBeNull();
    expect(screen.getByText('1 peça no total')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anunciadas (1)' })).toBeInTheDocument();
    // A aba e os filtros (frame ajustado, T15) também não contam o rascunho.
    expect(
      screen.getByRole('heading', { name: 'Minhas Peças Cadastradas (1)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todas (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anunciadas (1)' })).toBeInTheDocument();
  });

  it('só rascunhos conta como painel vazio', async () => {
    vi.mocked(getMine).mockResolvedValue(
      pagina([peca({ id: '2', name: 'Saia abandonada', status: 'rascunho' })]),
    );

    renderPage();

    expect(await screen.findByText('Nenhuma peça por aqui')).toBeInTheDocument();
  });

  it('peça vendida continua listada, como histórico', async () => {
    vi.mocked(getMine).mockResolvedValue(
      pagina([peca({ id: '1', name: 'Bota Chelsea', status: 'vendido' })]),
    );

    renderPage();

    expect(await screen.findByText('Bota Chelsea')).toBeInTheDocument();
  });

  // FE-US006-4 (#335): a edição da loja abre a partir do painel.
  it('"Editar loja" abre a tela de edição', async () => {
    vi.mocked(getMine).mockResolvedValue(pagina([]));
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Editar loja' }));

    expect(await screen.findByRole('heading', { name: 'Editar loja' })).toBeInTheDocument();
  });

  it('sem peças mostra o EmptyState com o CTA de anunciar', async () => {
    vi.mocked(getMine).mockResolvedValue(pagina([]));
    const user = userEvent.setup();

    renderPage();

    const mensagem = await screen.findByText(/anuncie sua primeira peça/i);
    const vazio = mensagem.closest('[role="status"]') as HTMLElement;

    await user.click(within(vazio).getByRole('button', { name: /anunciar peça/i }));

    expect(await screen.findByRole('heading', { name: 'Anunciar peça' })).toBeInTheDocument();
  });

  it('filtro sem resultado oferece voltar para todas, sem dizer que não há peças', async () => {
    vi.mocked(getMine).mockResolvedValue(
      pagina([peca({ id: '1', name: 'Jaqueta jeans', status: 'ativo' })]),
    );
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Jaqueta jeans');
    await user.click(screen.getByRole('button', { name: 'Vendidas (0)' }));

    expect(screen.getByText(/nada com esse filtro/i)).toBeInTheDocument();
    expect(screen.queryByText(/anuncie sua primeira peça/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver todas' }));

    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();
  });

  it('conta e lista as peças de todas as páginas, não só da primeira', async () => {
    const primeira = Array.from({ length: 100 }, (_, i) =>
      peca({ id: `a${i}`, name: `Anunciada ${i}`, status: 'ativo' }),
    );
    vi.mocked(getMine)
      .mockResolvedValueOnce({ items: primeira, page: 1, pageSize: 100, total: 102 })
      .mockResolvedValueOnce({
        items: [
          peca({ id: 'v1', name: 'Bota Chelsea', status: 'vendido' }),
          peca({ id: 'p1', name: 'Bolsa palha', status: 'despublicado' }),
        ],
        page: 2,
        pageSize: 100,
        total: 102,
      });

    renderPage();

    expect(await screen.findByText('102 peças no total')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anunciadas (100)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendidas (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pausadas (1)' })).toBeInTheDocument();
    // A aba e os filtros (frame ajustado, T15) usam as mesmas contagens.
    expect(
      screen.getByRole('heading', { name: 'Minhas Peças Cadastradas (102)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anunciadas (100)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vendidas (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pausadas (1)' })).toBeInTheDocument();
    expect(screen.getByText('Bota Chelsea')).toBeInTheDocument();
    expect(getMine).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 });
  });

  it('mostra o skeleton de linha enquanto carrega', () => {
    vi.mocked(getMine).mockReturnValue(new Promise(() => {}));

    renderPage();

    // Duas regiões carregam ao mesmo tempo: as peças e o resumo financeiro.
    expect(screen.getByText('Carregando suas peças…')).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('seller-skeleton')).toBeInTheDocument();
  });

  it('mostra ErrorState com retry quando a busca falha', async () => {
    vi.mocked(getMine)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValueOnce(pagina([peca({ name: 'Jaqueta jeans' })]));
    const user = userEvent.setup();

    renderPage();

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();

    await user.click(within(alerta).getByRole('button', { name: /tentar de novo/i }));

    expect(await screen.findByText('Jaqueta jeans')).toBeInTheDocument();
    expect(getMine).toHaveBeenCalledTimes(2);
  });

  describe('ações por peça (FE-US019-2)', () => {
    const ATIVA = peca({ id: '1', name: 'Jaqueta jeans', status: 'ativo' });
    const PAUSADA = peca({ id: '2', name: 'Bolsa palha', status: 'despublicado' });
    const VENDIDA = peca({ id: '3', name: 'Bota Chelsea', status: 'vendido' });

    function linha(nome: string) {
      return screen.getByText(nome).closest('article') as HTMLElement;
    }

    beforeEach(() => {
      vi.mocked(getMine).mockResolvedValue(pagina([ATIVA, PAUSADA, VENDIDA]));
      vi.mocked(unpublish).mockResolvedValue({} as never);
      vi.mocked(publish).mockResolvedValue({} as never);
    });

    it('monta as ações pelo status: ativa, pausada e vendida', async () => {
      renderPage();
      await screen.findByText('Jaqueta jeans');

      const ativa = within(linha('Jaqueta jeans'));
      expect(ativa.getByRole('button', { name: 'Editar anúncio' })).toBeEnabled();
      expect(ativa.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();

      const pausada = within(linha('Bolsa palha'));
      expect(pausada.getByRole('button', { name: 'Editar anúncio' })).toBeEnabled();
      expect(pausada.getByRole('button', { name: 'Republicar' })).toBeInTheDocument();
    });

    // O botão não pode mudar de tamanho nem empurrar o "Editar anúncio" ao pausar: "Pausar"
    // reserva a largura de "Republicar", que é o texto mais largo.
    it('"Pausar" reserva a largura de "Republicar"; "Republicar" já é o mais largo', async () => {
      renderPage();
      await screen.findByText('Jaqueta jeans');

      const pausar = within(linha('Jaqueta jeans')).getByRole('button', { name: 'Pausar' });
      expect(within(pausar).getByText('Republicar')).toHaveAttribute('aria-hidden', 'true');

      const republicar = within(linha('Bolsa palha')).getByRole('button', { name: 'Republicar' });
      expect(republicar.textContent).toBe('Republicar');
    });

    // Objetivo declarado: garantir RN-53.
    it('vendida tem Editar desabilitado com o motivo e não pode despublicar', async () => {
      renderPage();
      await screen.findByText('Bota Chelsea');

      const vendida = within(linha('Bota Chelsea'));
      const editar = vendida.getByRole('button', { name: 'Editar anúncio' });
      expect(editar).toBeDisabled();
      expect(editar).toHaveAccessibleDescription('Peça vendida não pode ser editada');
      expect(vendida.queryByRole('button', { name: 'Pausar' })).toBeNull();
      expect(vendida.queryByRole('button', { name: 'Bota Chelsea' })).toBeNull();
    });

    // Objetivo declarado: garantir RN-52.
    it('Pausar tira a peça da vitrine, ela continua na lista, e avisa com Desfazer', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Jaqueta jeans');

      await user.click(within(linha('Jaqueta jeans')).getByRole('button', { name: 'Pausar' }));

      expect(unpublish).toHaveBeenCalledWith('1');
      expect(await screen.findByText('Anúncio pausado')).toBeInTheDocument();
      expect(within(linha('Jaqueta jeans')).getByText('Pausada')).toBeInTheDocument();
      const republicar = within(linha('Jaqueta jeans')).getByRole('button', { name: 'Republicar' });
      expect(republicar).toBeInTheDocument();
      // "Republicar" é o texto mais largo: não reserva nada, mantém o tamanho dele.
      expect(republicar.textContent).toBe('Republicar');
      expect(screen.getByRole('button', { name: 'Pausadas (2)' })).toBeInTheDocument();
      expect(getMine).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: 'Desfazer' }));

      expect(publish).toHaveBeenCalledWith('1');
      const pausar = await within(linha('Jaqueta jeans')).findByRole('button', { name: 'Pausar' });
      expect(pausar).toBeInTheDocument();
      // De volta a "Pausar", o botão reserva a largura de "Republicar" e não encolhe.
      expect(within(pausar).getByText('Republicar')).toHaveAttribute('aria-hidden', 'true');
    });

    it('Republicar usa publish e volta a peça para anunciada', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Bolsa palha');

      await user.click(within(linha('Bolsa palha')).getByRole('button', { name: 'Republicar' }));

      expect(publish).toHaveBeenCalledWith('2');
      expect(await screen.findByText('Anúncio publicado de novo')).toBeInTheDocument();
      expect(within(linha('Bolsa palha')).getByText('Anunciada')).toBeInTheDocument();
    });

    // Objetivo declarado: garantir o reuso da VS-014.
    it('Editar leva ao formulário da peça', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Jaqueta jeans');

      await user.click(
        within(linha('Jaqueta jeans')).getByRole('button', { name: 'Editar anúncio' }),
      );

      expect(
        await screen.findByRole('heading', { name: 'Formulário da peça' }),
      ).toBeInTheDocument();
    });

    it('PRODUCT_SOLD do service vira aviso de erro e a linha não muda', async () => {
      vi.mocked(unpublish).mockRejectedValueOnce(
        new SellerProductError('PRODUCT_SOLD', 'Peça vendida não pode ser alterada.'),
      );
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Jaqueta jeans');

      await user.click(within(linha('Jaqueta jeans')).getByRole('button', { name: 'Pausar' }));

      expect(
        await screen.findByText('Esta peça já foi vendida e não pode mais ser alterada.'),
      ).toBeInTheDocument();
      expect(within(linha('Jaqueta jeans')).getByText('Anunciada')).toBeInTheDocument();
    });
  });

  describe('aba de rascunhos (FE-US019-6, #345)', () => {
    const PUBLICADAS = [
      peca({ id: '1', name: 'Jaqueta jeans', status: 'ativo' }),
      peca({ id: '2', name: 'Bota Chelsea', status: 'vendido' }),
    ];
    const RASCUNHOS = [
      peca({ id: '7', name: 'Saia plissada', status: 'rascunho' }),
      peca({
        id: '8',
        name: 'Blazer xadrez',
        status: 'rascunho',
        coverImageUrl: 'https://x/b.jpg',
      }),
    ];

    function comRascunhos(rascunhos: SellerProduct[] = RASCUNHOS) {
      vi.mocked(getMine).mockImplementation(async (params) =>
        pagina(params?.status === 'rascunho' ? rascunhos : PUBLICADAS),
      );
    }

    async function abrirAba(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: 'Rascunhos' }));
    }

    it('a aba fica ao lado das outras e lista os rascunhos', async () => {
      comRascunhos();
      const user = userEvent.setup();
      renderPage();

      await abrirAba(user);

      expect(getMine).toHaveBeenCalledWith(expect.objectContaining({ status: 'rascunho' }));
      expect(await screen.findByText('Saia plissada')).toBeInTheDocument();
      expect(screen.getByText('Blazer xadrez')).toBeInTheDocument();
      expect(screen.queryByText('Jaqueta jeans')).toBeNull();
    });

    it('sem rascunhos, explica o que é um rascunho', async () => {
      comRascunhos([]);
      const user = userEvent.setup();
      renderPage();

      await abrirAba(user);

      expect(await screen.findByText('Nenhum rascunho por aqui')).toBeInTheDocument();
      expect(
        screen.getByText(/Rascunho é a peça que você começou a cadastrar/),
      ).toBeInTheDocument();
    });

    it('"Continuar" leva para a revisão daquele rascunho', async () => {
      comRascunhos();
      const user = userEvent.setup();
      renderPage();

      await abrirAba(user);
      const linha = (await screen.findByText('Saia plissada')).closest('article')!;
      await user.click(within(linha).getByRole('button', { name: 'Continuar' }));

      expect(await screen.findByRole('heading', { name: 'Revisão da peça' })).toBeInTheDocument();
    });

    it('"Descartar" pede confirmação, apaga e não mexe nas contagens', async () => {
      comRascunhos();
      vi.mocked(discardDraft).mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage();

      await abrirAba(user);
      const linha = (await screen.findByText('Saia plissada')).closest('article')!;
      await user.click(within(linha).getByRole('button', { name: 'Descartar' }));

      const dialogo = await screen.findByRole('dialog', { name: 'Descartar rascunho?' });
      expect(discardDraft).not.toHaveBeenCalled();
      await user.click(within(dialogo).getByRole('button', { name: 'Descartar' }));

      expect(discardDraft).toHaveBeenCalledWith('7');
      await waitFor(() => expect(screen.queryByText('Saia plissada')).toBeNull());
      expect(screen.getByText('Blazer xadrez')).toBeInTheDocument();
      expect(screen.getByText('2 peças no total')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Anunciadas (1)' })).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Minhas Peças Cadastradas (2)' }),
      ).toBeInTheDocument();
    });

    it('cancelar a confirmação não descarta', async () => {
      comRascunhos();
      const user = userEvent.setup();
      renderPage();

      await abrirAba(user);
      const linha = (await screen.findByText('Saia plissada')).closest('article')!;
      await user.click(within(linha).getByRole('button', { name: 'Descartar' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
      );

      expect(discardDraft).not.toHaveBeenCalled();
      expect(screen.getByText('Saia plissada')).toBeInTheDocument();
    });

    it('rascunhos não entram nas contagens das peças anunciadas', async () => {
      comRascunhos();
      renderPage();

      expect(await screen.findByText('2 peças no total')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Anunciadas (1)' })).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'Minhas Peças Cadastradas (2)' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Anunciadas (1)' })).toBeInTheDocument();
    });
  });

  describe('visão financeira (FE-US019-3)', () => {
    beforeEach(() => {
      vi.mocked(getMine).mockResolvedValue(pagina([]));
    });

    // Objetivo declarado: garantir a visão financeira (RN-51.1, RN-11, RN-95).
    it('duas vendas de R$ 100 mostram bruto 200, taxa retida 18 e líquido 182', async () => {
      vi.mocked(getSalesSummary).mockResolvedValue({
        period: 'month',
        soldCount: 2,
        gross: 200,
        commission: 18,
        net: 182,
      });

      renderPage();

      const bruto = await screen.findByTestId('financeiro-bruto');
      expect(within(bruto).getByText('Faturamento bruto no mês')).toBeInTheDocument();
      expect(within(bruto).getByText('R$ 200,00')).toBeInTheDocument();
      expect(within(bruto).getByText('2 peças vendidas no mês')).toBeInTheDocument();
      const comissao = screen.getByTestId('financeiro-comissao');
      expect(within(comissao).getByText('Taxa média retida (9%)')).toBeInTheDocument();
      expect(within(comissao).getByText('R$ 18,00')).toBeInTheDocument();
      // O frame do Figma (T15) só tem os dois cartões acima: sem "Você recebeu".
      expect(screen.queryByTestId('financeiro-liquido')).toBeNull();
      expect(screen.queryByText('Você recebeu')).toBeNull();
      expect(getSalesSummary).toHaveBeenCalledWith('month');
    });

    // Critério da issue #437: os números vêm do resumo do back, nenhum é calculado na tela.
    it('mostra os números do resumo como vieram, sem recalcular nada', async () => {
      // 25 não é 9% de 200: se a tela recalculasse, apareceria R$ 18,00.
      vi.mocked(getSalesSummary).mockResolvedValue({
        period: 'month',
        soldCount: 2,
        gross: 200,
        commission: 25,
        net: 175,
      });

      renderPage();

      const comissao = await screen.findByTestId('financeiro-comissao');
      expect(within(comissao).getByText('R$ 25,00')).toBeInTheDocument();
      expect(screen.queryByText('R$ 18,00')).toBeNull();
    });

    // Fora do painel por falta de número no back (issue #437): não é inventado nem calculado.
    it('não mostra "Repasses pendentes" nem o percentual de líquido, que o back não traz', async () => {
      vi.mocked(getSalesSummary).mockResolvedValue({
        period: 'month',
        soldCount: 2,
        gross: 200,
        commission: 18,
        net: 182,
      });

      renderPage();

      await screen.findByTestId('financeiro-bruto');
      expect(screen.queryByText(/Repasses pendentes/i)).toBeNull();
      expect(screen.queryByText(/91%/)).toBeNull();
      expect(screen.queryByText(/Pedidos para Envio/i)).toBeNull();
    });

    it('uma venda usa o singular', async () => {
      vi.mocked(getSalesSummary).mockResolvedValue({
        period: 'month',
        soldCount: 1,
        gross: 100,
        commission: 9,
        net: 91,
      });

      renderPage();

      expect(await screen.findByText('1 peça vendida no mês')).toBeInTheDocument();
    });

    // O seletor de período não está no frame do Figma (T15): fica fora da página (o componente Select continua no projeto).
    it('não mostra o seletor de período e consulta o mês, com uma consulta só', async () => {
      renderPage();

      await screen.findByTestId('financeiro-bruto');
      expect(screen.getByRole('heading', { name: 'Financeiro' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Período')).toBeNull();
      expect(getSalesSummary).toHaveBeenCalledTimes(1);
      expect(getSalesSummary).toHaveBeenCalledWith('month');
    });

    it('mostra o skeleton dos cartões enquanto carrega o resumo', async () => {
      vi.mocked(getSalesSummary).mockReturnValue(new Promise(() => {}));

      renderPage();

      expect(await screen.findByTestId('financeiro-skeleton')).toBeInTheDocument();
      expect(screen.queryByTestId('financeiro-bruto')).toBeNull();
    });

    it('sem vendas mostra R$ 0,00 e uma nota', async () => {
      renderPage();

      const bruto = await screen.findByTestId('financeiro-bruto');
      expect(within(bruto).getByText('R$ 0,00')).toBeInTheDocument();
      expect(
        within(screen.getByTestId('financeiro-comissao')).getByText('R$ 0,00'),
      ).toBeInTheDocument();
      expect(screen.getByText(/Nenhuma venda neste período ainda/)).toBeInTheDocument();
    });

    // docs/adr/0002 (#297): rota ausente no back não é falha que se tenta de novo.
    it('resumo sem rota no back mostra que ainda não está disponível, sem tentar de novo', async () => {
      vi.mocked(getSalesSummary).mockRejectedValue(
        new SellerProductError(
          'NOT_AVAILABLE_YET',
          'O resumo financeiro ainda não está disponível.',
        ),
      );
      renderPage();

      expect(
        await screen.findByText('O resumo financeiro ainda não está disponível.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Não foi possível carregar o resumo financeiro.')).toBeNull();
    });

    it('erro no resumo mostra tentar de novo, que refaz a consulta', async () => {
      vi.mocked(getSalesSummary).mockRejectedValueOnce(new Error('fora do ar'));
      const user = userEvent.setup();
      renderPage();

      expect(
        await screen.findByText('Não foi possível carregar o resumo financeiro.'),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

      expect(await screen.findByTestId('financeiro-bruto')).toBeInTheDocument();
      expect(getSalesSummary).toHaveBeenCalledTimes(2);
    });
  });

  describe('selo Confiável (FE-US007-1)', () => {
    const LOJA: StoreProfile = {
      id: 'store-1',
      name: 'Brechó da Ana',
      description: '',
      logoUrl: null,
      city: 'Porto Alegre',
      state: 'RS',
      verification: 'confiavel',
      createdAt: '2026-09-01T00:00:00.000Z',
    };

    beforeEach(() => {
      vi.mocked(getMine).mockResolvedValue(pagina([]));
    });

    // Objetivo declarado: garantir a verificação simulada (RN-72).
    it('pendente mostra o selo Pendente e validar vira Confiável com aviso', async () => {
      vi.mocked(requestVerification).mockResolvedValue(LOJA);
      const user = userEvent.setup();
      renderPage();

      const card = within(await screen.findByRole('region', { name: 'Selo Confiável' }));
      expect(await card.findByRole('img', { name: 'Pendente' })).toBeInTheDocument();
      expect(card.getByText(/a validação é simulada/)).toBeInTheDocument();

      await user.click(card.getByRole('button', { name: 'Validar meus dados' }));

      expect(await card.findByRole('img', { name: 'Confiável' })).toBeInTheDocument();
      expect(card.queryByRole('button', { name: 'Validar meus dados' })).toBeNull();
      expect(screen.getByText('Pronto! Sua loja agora tem o selo Confiável.')).toBeInTheDocument();
    });

    it('já confiável não oferece validar de novo', async () => {
      vi.mocked(getMyVerification).mockResolvedValue('confiavel');
      renderPage();

      const card = within(await screen.findByRole('region', { name: 'Selo Confiável' }));
      expect(await card.findByRole('img', { name: 'Confiável' })).toBeInTheDocument();
      expect(card.queryByRole('button', { name: 'Validar meus dados' })).toBeNull();
    });

    it('falha ao validar avisa e mantém Pendente', async () => {
      vi.mocked(requestVerification).mockRejectedValue(new Error('fora do ar'));
      const user = userEvent.setup();
      renderPage();

      const card = within(await screen.findByRole('region', { name: 'Selo Confiável' }));
      await user.click(await card.findByRole('button', { name: 'Validar meus dados' }));

      expect(
        await screen.findByText('Não foi possível validar seus dados agora. Tente de novo.'),
      ).toBeInTheDocument();
      expect(card.getByRole('img', { name: 'Pendente' })).toBeInTheDocument();
    });
  });
});
