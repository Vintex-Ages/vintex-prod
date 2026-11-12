import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/context/ToastContext';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { CartContext, type CartContextValue } from '@/context/useCart';
import { paths, productDetail, storeProfile } from '@/routes/paths';
import { CombinationError, getCombinations } from '@/services/combinationService';
import { getOrder, OrderError } from '@/services/orderService';
import type { LookSuggestion } from '@/types/look';
import type { Order, OrderStatus } from '@/types/order';
import OrderDetail from './OrderDetail';

vi.mock('@/services/orderService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/orderService')>()),
  getOrder: vi.fn(),
}));

/** Looks do Pedido (#430): a rota de combinações é sempre mockada aqui. */
vi.mock('@/services/combinationService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/combinationService')>()),
  getCombinations: vi.fn(),
}));

/**
 * Detalhe do Pedido (FE-US023-2, #322). As datas estão em UTC; São Paulo é
 * UTC-3, então 15:00Z aparece como 12:00 em qualquer máquina.
 */

const AUTH: AuthContextValue = {
  user: { id: 'u_1', name: 'Ana', email: 'ana@exemplo.com', is_seller: false, is_admin: false },
  token: 't',
  isAuthenticated: true,
  loading: false,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
};

const PIX_KEY = 'baudavonair@vintex.com';

function historico(statuses: OrderStatus[]) {
  return statuses.map((status, indice) => ({
    status,
    at: `2026-10-0${indice + 1}T15:00:00.000Z`,
  }));
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ped-1',
    store: { id: '5', name: 'Baú da Vó Nair', pixKey: PIX_KEY },
    items: [
      { productId: '5', name: 'Calça jeans reta', price: 119.9, coverImageUrl: null },
      { productId: '8', name: 'Blusa de linho', price: 40.1, coverImageUrl: '/img/blusa.jpg' },
    ],
    productAmount: 160,
    platformFee: 14.4,
    totalAmount: 160,
    status: 'aguardando_comprovante',
    history: historico(['aguardando_comprovante']),
    deliveryAddress: {
      zipCode: '90010-000',
      street: 'Rua dos Andradas',
      number: '500',
      complement: 'Ap. 302',
      neighborhood: 'Centro Histórico',
      city: 'Porto Alegre',
      state: 'RS',
    },
    payment: null,
    createdAt: '2026-10-01T15:00:00.000Z',
    expiresAt: '2026-10-04T15:00:00.000Z',
    ...overrides,
  };
}

function cartValue(overrides: Partial<CartContextValue> = {}): CartContextValue {
  return {
    cart: { groups: [] },
    count: 0,
    loading: false,
    error: null,
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Carrinho e toast vêm do `App`; aqui, para o "+ Adicionar" dos looks (#430). */
function renderDetail(cart: CartContextValue = cartValue()) {
  return render(
    <MemoryRouter initialEntries={['/profile/orders/ped-1']}>
      <AuthContext.Provider value={AUTH}>
        <CartContext.Provider value={cart}>
          <ToastProvider>
            <Routes>
              <Route path={paths.orderDetail} element={<OrderDetail />} />
              <Route path={paths.orderPayment} element={<h1>Pagamento do pedido</h1>} />
              <Route path={paths.orders} element={<h1>Meus pedidos</h1>} />
            </Routes>
          </ToastProvider>
        </CartContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

const EMPTY_LOOK: LookSuggestion = { pieces: [], matchType: 'exact', totalAmount: 0 };

function lookCom(id: string, name: string, matchType: LookSuggestion['matchType'] = 'exact') {
  return {
    pieces: [
      {
        id,
        name,
        price: 90,
        category: 'Acessórios',
        coverImageUrl: null,
        store: { id: '2', name: 'Brechó da Redenção' },
      },
    ],
    matchType,
    totalAmount: 90,
  } satisfies LookSuggestion;
}

const tituloLook = (peca: string) => `Combine com ${peca} e monte o look`;

/** A seção de look pela peça de origem (o título é o `h3` do `LookSuggestions`). */
async function secaoLook(peca: string) {
  const heading = await screen.findByRole('heading', { name: tituloLook(peca) });
  const section = heading.closest('section');
  if (!section) throw new Error(`seção do look de ${peca} não encontrada`);
  return within(section);
}

async function pronto() {
  await screen.findByRole('region', { name: 'Andamento do pedido' });
}

function etapas() {
  return within(screen.getByRole('region', { name: 'Andamento do pedido' })).getAllByRole(
    'listitem',
  );
}

beforeEach(() => {
  vi.mocked(getOrder).mockReset();
  // Padrão: sem combinações, nenhuma seção de look aparece nos demais testes.
  vi.mocked(getCombinations).mockReset().mockResolvedValue(EMPTY_LOOK);
});

afterEach(cleanup);

describe('<OrderDetail />', () => {
  // Objetivo declarado 1: a data de cada etapa atingida é registrada.
  it('Pedido enviado mostra as cinco etapas atingidas com data', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        status: 'enviado',
        history: historico([
          'aguardando_comprovante',
          'em_analise',
          'confirmado',
          'preparando',
          'enviado',
        ]),
        payment: { status: 'aprovado', receiptName: 'pix.pdf' },
      }),
    );
    renderDetail();
    await pronto();

    const lista = etapas();
    const esperado = [
      ['Aguardando comprovante', '01/10/2026 12:00'],
      ['Comprovante em análise', '02/10/2026 12:00'],
      ['Pagamento confirmado', '03/10/2026 12:00'],
      ['Preparando', '04/10/2026 12:00'],
      ['Enviado', '05/10/2026 12:00'],
    ];
    esperado.forEach(([rotulo, data], indice) => {
      expect(within(lista[indice]).getByText(rotulo)).toBeInTheDocument();
      expect(within(lista[indice]).getByText(data)).toBeInTheDocument();
    });
    expect(lista[4]).toHaveAttribute('aria-current', 'step');
    expect(lista[5].querySelector('time')).toBeNull();
    expect(getOrder).toHaveBeenCalledWith('u_1', 'ped-1');
  });

  // Objetivo declarado 2: RN-23.
  it('comprovante rejeitado mostra o motivo e "Reenviar comprovante" leva ao pagamento', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        payment: {
          status: 'rejeitado',
          receiptName: 'pix.jpg',
          rejectionReason: 'Valor diferente do total do Pedido.',
        },
      }),
    );
    renderDetail();
    await pronto();

    expect(screen.getByText('Valor diferente do total do Pedido.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar comprovante' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar comprovante' }));

    expect(await screen.findByRole('heading', { name: 'Pagamento do pedido' })).toBeInTheDocument();
  });

  it('aguardando comprovante sem rejeição mostra "Enviar comprovante" e o prazo', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderDetail();
    await pronto();

    // expiresAt 2026-10-04T15:00Z = 12:00 em São Paulo.
    expect(screen.getByText(/04\/10\/2026 12:00/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar comprovante' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));

    expect(await screen.findByRole('heading', { name: 'Pagamento do pedido' })).toBeInTheDocument();
  });

  it('expirado avisa uma vez só, explica e não oferece pagamento', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        status: 'expirado',
        history: [
          { status: 'aguardando_comprovante', at: '2026-10-01T15:00:00.000Z' },
          { status: 'expirado', at: '2026-10-04T15:00:00.000Z' },
        ],
      }),
    );
    renderDetail();
    await pronto();

    // O texto é da linha do tempo; a página não repete.
    expect(screen.getAllByText('Pedido expirado')).toHaveLength(1);
    expect(screen.getByText(/peças voltaram a ficar disponíveis/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /comprovante/i })).not.toBeInTheDocument();
  });

  it('a loja e cada peça levam às suas páginas', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderDetail();
    await pronto();

    expect(screen.getByRole('link', { name: 'Baú da Vó Nair' })).toHaveAttribute(
      'href',
      storeProfile('5'),
    );
    expect(screen.getByRole('link', { name: 'Calça jeans reta' })).toHaveAttribute(
      'href',
      productDetail('5'),
    );
    expect(screen.getByRole('link', { name: 'Blusa de linho' })).toHaveAttribute(
      'href',
      productDetail('8'),
    );
  });

  it('mostra o endereço com os rótulos CEP e Bairro, e o total', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    renderDetail();
    await pronto();

    const endereco = screen.getByRole('region', { name: 'Endereço de entrega' });
    expect(within(endereco).getByText('CEP')).toBeInTheDocument();
    expect(within(endereco).getByText('90010-000')).toBeInTheDocument();
    expect(within(endereco).getByText('Bairro')).toBeInTheDocument();
    expect(within(endereco).getByText('Centro Histórico')).toBeInTheDocument();
    expect(within(endereco).getByText(/Rua dos Andradas, 500/)).toBeInTheDocument();
    expect(screen.getByText('R$ 160,00')).toBeInTheDocument();
  });

  it('mostra o nome e a situação do comprovante, nunca o arquivo', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        status: 'em_analise',
        history: historico(['aguardando_comprovante', 'em_analise']),
        payment: {
          status: 'pendente',
          receiptName: 'comprovante-pix.pdf',
          submittedAt: '2026-10-02T15:00:00.000Z',
        },
      }),
    );
    const { container } = renderDetail();
    await pronto();

    const comprovante = screen.getByRole('region', { name: 'Comprovante' });
    expect(within(comprovante).getByText('comprovante-pix.pdf')).toBeInTheDocument();
    expect(within(comprovante).getByText('Em análise')).toBeInTheDocument();
    expect(within(comprovante).queryByRole('link')).not.toBeInTheDocument();
    expect(within(comprovante).queryByRole('img')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/comprovante-pix\.pdf"/);
  });

  it('não mostra a chave Pix nem a comissão do vendedor', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    const { container } = renderDetail();
    await pronto();

    expect(container.textContent).not.toContain(PIX_KEY);
    expect(container.textContent).not.toMatch(/comiss|taxa/i);
    expect(container.textContent).not.toContain('R$ 14,40');
  });

  // RN-83: sem rastreio de transportadora. "Avaliar loja"/"Reportar problema" são Sprint 4.
  it('não mostra rastreio, avaliação nem reporte', async () => {
    vi.mocked(getOrder).mockResolvedValue(
      makeOrder({
        status: 'enviado',
        history: historico([
          'aguardando_comprovante',
          'em_analise',
          'confirmado',
          'preparando',
          'enviado',
        ]),
      }),
    );
    const { container } = renderDetail();
    await pronto();

    expect(container.textContent).not.toMatch(
      /rastrei|rastreamento|transportadora|código de|avaliar|reportar/i,
    );
  });

  it('Pedido inexistente ou de outro usuário mostra o ErrorState, sem tentar de novo', async () => {
    vi.mocked(getOrder).mockRejectedValue(new OrderError('ORDER_NOT_FOUND', 'não encontrado'));
    renderDetail();

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('Pedido não encontrado');
    expect(within(alerta).queryByRole('button')).not.toBeInTheDocument();
    // O título da página fica, para o leitor de tela saber onde está.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Detalhe do pedido' }),
    ).toBeInTheDocument();
  });

  it('outra falha mostra o ErrorState com "Tentar de novo"', async () => {
    vi.mocked(getOrder)
      .mockRejectedValueOnce(new Error('rede fora'))
      .mockResolvedValue(makeOrder());
    renderDetail();

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));

    await pronto();
    expect(screen.getByRole('button', { name: 'Enviar comprovante' })).toBeInTheDocument();
  });

  it('recarrega ao voltar à aba e mostra a nova situação', async () => {
    vi.mocked(getOrder)
      .mockResolvedValueOnce(makeOrder())
      .mockResolvedValueOnce(
        makeOrder({
          status: 'em_analise',
          history: historico(['aguardando_comprovante', 'em_analise']),
          payment: { status: 'pendente', receiptName: 'pix.pdf' },
        }),
      );
    renderDetail();
    await pronto();
    expect(screen.getByRole('button', { name: 'Enviar comprovante' })).toBeInTheDocument();

    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Enviar comprovante' })).not.toBeInTheDocument(),
    );
    expect(etapas()[1]).toHaveAttribute('aria-current', 'step');
  });

  it('não usa nenhuma cor em hex cru', async () => {
    vi.mocked(getOrder).mockResolvedValue(makeOrder());
    const { container } = renderDetail();
    await pronto();

    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });

  describe('looks por peça comprada (FE-US030-2, #430)', () => {
    // Teste 1.
    it('uma seção por peça, com o nome da peça de origem no título', async () => {
      vi.mocked(getCombinations).mockImplementation((productId) =>
        Promise.resolve(
          productId === '5'
            ? lookCom('7', 'Bolsa baú de couro caramelo')
            : lookCom('9', 'Lenço de seda estampado'),
        ),
      );
      vi.mocked(getOrder).mockResolvedValue(makeOrder());
      renderDetail();

      expect(
        (await secaoLook('Calça jeans reta')).getByText('Bolsa baú de couro caramelo'),
      ).toBeInTheDocument();
      expect(
        (await secaoLook('Blusa de linho')).getByText('Lenço de seda estampado'),
      ).toBeInTheDocument();
      expect(getCombinations).toHaveBeenCalledTimes(2);
      expect(getCombinations).toHaveBeenCalledWith('5');
      expect(getCombinations).toHaveBeenCalledWith('8');
    });

    // Teste 2.
    it('com combinação, vazia e falha: só a seção com peças aparece e o Pedido fica inteiro', async () => {
      vi.mocked(getCombinations).mockImplementation((productId) => {
        if (productId === '5') return Promise.resolve(lookCom('7', 'Bolsa baú de couro caramelo'));
        if (productId === '8') return Promise.resolve(EMPTY_LOOK);
        return Promise.reject(new CombinationError('INTERNAL_ERROR', 'falhou'));
      });
      vi.mocked(getOrder).mockResolvedValue(
        makeOrder({
          items: [
            { productId: '5', name: 'Calça jeans reta', price: 119.9, coverImageUrl: null },
            { productId: '8', name: 'Blusa de linho', price: 40.1, coverImageUrl: null },
            { productId: '9', name: 'Saia midi plissada', price: 60, coverImageUrl: null },
          ],
        }),
      );
      renderDetail();

      await secaoLook('Calça jeans reta');
      await waitFor(() => expect(getCombinations).toHaveBeenCalledTimes(3));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(screen.queryByRole('heading', { name: tituloLook('Blusa de linho') })).toBeNull();
      expect(screen.queryByRole('heading', { name: tituloLook('Saia midi plissada') })).toBeNull();
      expect(screen.getAllByText('Curadoria da IA Vintex')).toHaveLength(1);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      for (const regiao of ['Andamento do pedido', 'Peças', 'Endereço de entrega', 'Comprovante']) {
        expect(screen.getByRole('region', { name: regiao })).toBeInTheDocument();
      }
      expect(screen.getByRole('link', { name: 'Saia midi plissada' })).toBeInTheDocument();
    });

    // Teste 3.
    it('uma seção lenta não bloqueia a outra', async () => {
      vi.mocked(getCombinations).mockImplementation((productId) =>
        productId === '5'
          ? new Promise(() => {})
          : Promise.resolve(lookCom('9', 'Lenço de seda estampado')),
      );
      vi.mocked(getOrder).mockResolvedValue(makeOrder());
      renderDetail();

      expect(
        (await secaoLook('Blusa de linho')).getByText('Lenço de seda estampado'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: tituloLook('Calça jeans reta') })).toBeNull();
    });

    // Teste 4: no Pedido, a peça de origem já foi reservada ou vendida.
    it.each(['confirmado', 'concluido'] as const)(
      'Pedido %s (peças reservadas/vendidas) mostra a seção',
      async (status) => {
        vi.mocked(getCombinations).mockResolvedValue(lookCom('7', 'Bolsa baú de couro caramelo'));
        vi.mocked(getOrder).mockResolvedValue(
          makeOrder({ status, payment: { status: 'aprovado', receiptName: 'pix.pdf' } }),
        );
        renderDetail();

        expect(await secaoLook('Calça jeans reta')).toBeTruthy();
      },
    );

    // Teste 5.
    it('fallback mostra a linha de alternativa', async () => {
      vi.mocked(getCombinations).mockResolvedValue(
        lookCom('7', 'Bolsa baú de couro caramelo', 'fallback'),
      );
      vi.mocked(getOrder).mockResolvedValue(makeOrder());
      renderDetail();

      expect(
        (await secaoLook('Calça jeans reta')).getByText(/estas são alternativas próximas/),
      ).toBeInTheDocument();
    });

    // Teste 6 (integração; os casos de sacola estão no teste do OrderLookSection).
    it('"+ Adicionar" põe a peça sugerida na sacola e mostra o toast', async () => {
      const add = vi.fn().mockResolvedValue(undefined);
      vi.mocked(getCombinations).mockImplementation((productId) =>
        Promise.resolve(
          productId === '5' ? lookCom('7', 'Bolsa baú de couro caramelo') : EMPTY_LOOK,
        ),
      );
      vi.mocked(getOrder).mockResolvedValue(makeOrder());
      renderDetail(cartValue({ add }));

      fireEvent.click(
        (await secaoLook('Calça jeans reta')).getByRole('button', {
          name: /Adicionar Bolsa baú de couro caramelo à sacola/,
        }),
      );

      expect(await screen.findByText('Adicionada ao carrinho')).toBeInTheDocument();
      expect(add).toHaveBeenCalledWith('7');
    });

    // Teste 7.
    it('Pedido carregando não chama getCombinations', () => {
      vi.mocked(getOrder).mockReturnValue(new Promise(() => {}));
      renderDetail();

      expect(screen.getByRole('status')).toHaveTextContent('Carregando o pedido...');
      expect(getCombinations).not.toHaveBeenCalled();
    });

    it.each([
      ['não encontrado', new OrderError('ORDER_NOT_FOUND', 'não encontrado')],
      ['com erro', new Error('rede')],
    ])('Pedido %s não chama getCombinations', async (_caso, erro) => {
      vi.mocked(getOrder).mockRejectedValue(erro);
      renderDetail();

      await screen.findByRole('alert');
      expect(getCombinations).not.toHaveBeenCalled();
    });
  });
});
