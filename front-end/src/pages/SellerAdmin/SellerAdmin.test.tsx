import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/context/ToastContext';
import {
  getMine,
  getSalesSummary,
  publish,
  SellerProductError,
  unpublish,
} from '@/services/sellerProductService';
import type { Paginated, SellerProduct } from '@/types/product';
import SellerAdmin from './SellerAdmin';

vi.mock('@/services/sellerProductService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/sellerProductService')>()),
  getMine: vi.fn(),
  getSalesSummary: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
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
          <Route path="/seller/products/:id" element={<h1>Formulário da peça</h1>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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

    const anunciadas = await screen.findByTestId('stat-anunciadas');
    expect(within(anunciadas).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-vendidas')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-pausadas')).getByText('1')).toBeInTheDocument();

    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();
    expect(screen.getByText('Bota Chelsea')).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Vendidas' }));

    expect(screen.getByText('Bota Chelsea')).toBeInTheDocument();
    expect(screen.queryByText('Jaqueta jeans')).not.toBeInTheDocument();
    expect(getMine).toHaveBeenCalledTimes(1);
  });

  it('peça vendida continua listada, como histórico', async () => {
    vi.mocked(getMine).mockResolvedValue(
      pagina([peca({ id: '1', name: 'Bota Chelsea', status: 'vendido' })]),
    );

    renderPage();

    expect(await screen.findByText('Bota Chelsea')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Vendidas' }));

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

    const anunciadas = await screen.findByTestId('stat-anunciadas');
    expect(within(anunciadas).getByText('100')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-vendidas')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-pausadas')).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('102 peças no total')).toBeInTheDocument();
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
      expect(ativa.getByRole('button', { name: 'Editar' })).toBeEnabled();
      expect(ativa.getByRole('button', { name: 'Despublicar' })).toBeInTheDocument();

      const pausada = within(linha('Bolsa palha'));
      expect(pausada.getByRole('button', { name: 'Editar' })).toBeEnabled();
      expect(pausada.getByRole('button', { name: 'Republicar' })).toBeInTheDocument();
    });

    // Objetivo declarado: garantir RN-53.
    it('vendida tem Editar desabilitado com o motivo e não pode despublicar', async () => {
      renderPage();
      await screen.findByText('Bota Chelsea');

      const vendida = within(linha('Bota Chelsea'));
      const editar = vendida.getByRole('button', { name: 'Editar' });
      expect(editar).toBeDisabled();
      expect(editar).toHaveAccessibleDescription('Peça vendida não pode ser editada');
      expect(vendida.queryByRole('button', { name: 'Despublicar' })).toBeNull();
      expect(vendida.queryByRole('button', { name: 'Bota Chelsea' })).toBeNull();
    });

    // Objetivo declarado: garantir RN-52.
    it('Despublicar pausa a peça, que continua na lista, e avisa com Desfazer', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Jaqueta jeans');

      await user.click(within(linha('Jaqueta jeans')).getByRole('button', { name: 'Despublicar' }));

      expect(unpublish).toHaveBeenCalledWith('1');
      expect(await screen.findByText('Anúncio pausado')).toBeInTheDocument();
      expect(within(linha('Jaqueta jeans')).getByText('Pausada')).toBeInTheDocument();
      expect(
        within(linha('Jaqueta jeans')).getByRole('button', { name: 'Republicar' }),
      ).toBeInTheDocument();
      expect(within(screen.getByTestId('stat-pausadas')).getByText('2')).toBeInTheDocument();
      expect(getMine).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: 'Desfazer' }));

      expect(publish).toHaveBeenCalledWith('1');
      expect(
        await within(linha('Jaqueta jeans')).findByRole('button', { name: 'Despublicar' }),
      ).toBeInTheDocument();
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

      await user.click(within(linha('Jaqueta jeans')).getByRole('button', { name: 'Editar' }));

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

      await user.click(within(linha('Jaqueta jeans')).getByRole('button', { name: 'Despublicar' }));

      expect(
        await screen.findByText('Esta peça já foi vendida e não pode mais ser alterada.'),
      ).toBeInTheDocument();
      expect(within(linha('Jaqueta jeans')).getByText('Anunciada')).toBeInTheDocument();
    });
  });

  describe('visão financeira (FE-US019-3)', () => {
    beforeEach(() => {
      vi.mocked(getMine).mockResolvedValue(pagina([]));
    });

    // Objetivo declarado: garantir a visão financeira (RN-51.1, RN-11).
    it('duas vendas de R$ 100 mostram bruto 200, comissão 18 e líquido 182', async () => {
      vi.mocked(getSalesSummary).mockResolvedValue({
        period: 'month',
        soldCount: 2,
        gross: 200,
        commission: 18,
        net: 182,
      });

      renderPage();

      const bruto = await screen.findByTestId('financeiro-bruto');
      expect(within(bruto).getByText('Vendido no período')).toBeInTheDocument();
      expect(within(bruto).getByText('R$ 200,00')).toBeInTheDocument();
      const comissao = screen.getByTestId('financeiro-comissao');
      expect(within(comissao).getByText('Comissão (9%)')).toBeInTheDocument();
      expect(within(comissao).getByText('R$ 18,00')).toBeInTheDocument();
      expect(
        within(screen.getByTestId('financeiro-liquido')).getByText('R$ 182,00'),
      ).toBeInTheDocument();
      expect(getSalesSummary).toHaveBeenCalledWith('month');
    });

    // Objetivo declarado: garantir o filtro.
    it('trocar o período refaz a consulta com skeleton nos cards', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByTestId('financeiro-bruto');

      let resolver: () => void = () => {};
      vi.mocked(getSalesSummary).mockImplementationOnce(
        (period) =>
          new Promise((resolve) => {
            resolver = () => resolve({ period, soldCount: 1, gross: 100, commission: 9, net: 91 });
          }),
      );

      await user.selectOptions(screen.getByLabelText('Período'), 'Últimos 30 dias');

      expect(getSalesSummary).toHaveBeenLastCalledWith('30d');
      expect(screen.getByTestId('financeiro-skeleton')).toBeInTheDocument();

      resolver();
      const liquido = await screen.findByTestId('financeiro-liquido');
      expect(await within(liquido).findByText('R$ 91,00')).toBeInTheDocument();
    });

    it('sem vendas mostra R$ 0,00 e uma nota', async () => {
      renderPage();

      const liquido = await screen.findByTestId('financeiro-liquido');
      expect(within(liquido).getByText('R$ 0,00')).toBeInTheDocument();
      expect(screen.getByText(/Nenhuma venda neste período ainda/)).toBeInTheDocument();
    });

    it('erro no resumo mostra tentar de novo, que refaz a consulta', async () => {
      vi.mocked(getSalesSummary).mockRejectedValueOnce(new Error('fora do ar'));
      const user = userEvent.setup();
      renderPage();

      expect(
        await screen.findByText('Não foi possível carregar o resumo financeiro.'),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

      expect(await screen.findByTestId('financeiro-liquido')).toBeInTheDocument();
      expect(getSalesSummary).toHaveBeenCalledTimes(2);
    });
  });
});
