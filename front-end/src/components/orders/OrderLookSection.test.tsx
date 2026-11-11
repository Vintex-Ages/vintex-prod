import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/context/ToastContext';
import { CartContext, type CartContextValue } from '@/context/useCart';
import { paths } from '@/routes/paths';
import { CombinationError, getCombinations } from '@/services/combinationService';
import type { Cart } from '@/types/cart';
import type { LookSuggestion } from '@/types/look';
import OrderLookSection from './OrderLookSection';

vi.mock('@/services/combinationService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/combinationService')>()),
  getCombinations: vi.fn(),
}));

/** Looks no detalhe do Pedido, uma seção por peça comprada (FE-US030-2, #430). */

const LOOK: LookSuggestion = {
  pieces: [
    {
      id: '7',
      name: 'Bolsa baú de couro caramelo',
      price: 90,
      category: 'Acessórios',
      coverImageUrl: null,
      store: { id: '2', name: 'Brechó da Redenção' },
    },
  ],
  matchType: 'exact',
  totalAmount: 90,
};

const TITLE = 'Combine com Calça jeans reta e monte o look';
const ADD_BOLSA = /Adicionar Bolsa baú de couro caramelo à sacola/;

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

function renderSection(
  value: CartContextValue = cartValue(),
  props = { productId: '5', name: 'Calça jeans reta' },
) {
  const ui = (p: typeof props) => (
    <MemoryRouter>
      <CartContext.Provider value={value}>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<OrderLookSection {...p} />} />
            <Route path={paths.cart} element={<h1>Carrinho de compras</h1>} />
          </Routes>
        </ToastProvider>
      </CartContext.Provider>
    </MemoryRouter>
  );
  const result = render(ui(props));
  return { ...result, rerenderWith: (p: typeof props) => result.rerender(ui(p)) };
}

async function secao(title = TITLE) {
  const heading = await screen.findByRole('heading', { name: title });
  const section = heading.closest('section');
  if (!section) throw new Error('seção não encontrada');
  return within(section);
}

/** Nada da seção na tela (o `ToastProvider` sempre deixa a região de avisos). */
function expectSemSecao() {
  expect(document.querySelector('section')).toBeNull();
  expect(screen.queryByText('Curadoria da IA Vintex')).not.toBeInTheDocument();
}

beforeEach(() => {
  vi.mocked(getCombinations).mockReset();
});

afterEach(cleanup);

describe('<OrderLookSection />', () => {
  it('carrega as combinações da peça de origem e mostra o nome dela no título', async () => {
    vi.mocked(getCombinations).mockResolvedValue(LOOK);
    renderSection();

    const s = await secao();
    expect(s.getByText('Bolsa baú de couro caramelo')).toBeInTheDocument();
    expect(getCombinations).toHaveBeenCalledWith('5');
  });

  it('fallback mostra a linha de alternativa', async () => {
    vi.mocked(getCombinations).mockResolvedValue({ ...LOOK, matchType: 'fallback' });
    renderSection();

    expect((await secao()).getByText(/estas são alternativas próximas/)).toBeInTheDocument();
  });

  it.each([
    [
      'sem peças',
      () => Promise.resolve({ pieces: [], matchType: 'exact' as const, totalAmount: 0 }),
    ],
    ['falha', () => Promise.reject(new CombinationError('INTERNAL_ERROR', 'falhou'))],
  ])('%s: não renderiza nada', async (_caso, impl) => {
    vi.mocked(getCombinations).mockImplementation(impl);
    renderSection();

    await waitFor(() => expect(getCombinations).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expectSemSecao();
  });

  it('carregando: nada aparece', () => {
    vi.mocked(getCombinations).mockReturnValue(new Promise(() => {}));
    renderSection();

    expectSemSecao();
  });

  it('descarta a resposta de uma peça de origem que mudou', async () => {
    let resolveFirst: (value: LookSuggestion) => void = () => {};
    vi.mocked(getCombinations)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ pieces: [], matchType: 'exact', totalAmount: 0 });
    const { rerenderWith } = renderSection();

    rerenderWith({ productId: '6', name: 'Camisa social branca' });
    await waitFor(() => expect(getCombinations).toHaveBeenCalledWith('6'));
    resolveFirst(LOOK);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expectSemSecao();
  });

  describe('"+ Adicionar"', () => {
    it('põe a peça sugerida na sacola e mostra o toast com "Ver carrinho"', async () => {
      const user = userEvent.setup();
      const add = vi.fn().mockResolvedValue(undefined);
      vi.mocked(getCombinations).mockResolvedValue(LOOK);
      renderSection(cartValue({ add }));

      await user.click((await secao()).getByRole('button', { name: ADD_BOLSA }));

      expect(add).toHaveBeenCalledOnce();
      expect(add).toHaveBeenCalledWith('7');
      expect(await screen.findByText('Adicionada ao carrinho')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Ver carrinho' }));
      expect(
        await screen.findByRole('heading', { name: 'Carrinho de compras' }),
      ).toBeInTheDocument();
    });

    it('falha do add mostra o toast de erro', async () => {
      const user = userEvent.setup();
      const add = vi.fn().mockRejectedValue(new Error('falhou'));
      vi.mocked(getCombinations).mockResolvedValue(LOOK);
      renderSection(cartValue({ add }));

      await user.click((await secao()).getByRole('button', { name: ADD_BOLSA }));

      expect(
        await screen.findByText('Não foi possível adicionar ao carrinho. Tente novamente.'),
      ).toBeInTheDocument();
    });

    it('peça já na sacola não é adicionada de novo, sem erro', async () => {
      const user = userEvent.setup();
      const add = vi.fn().mockResolvedValue(undefined);
      const cart: Cart = {
        groups: [
          {
            store: { id: '2', name: 'Brechó da Redenção', city: 'Porto Alegre' },
            items: [
              {
                product: {
                  id: '7',
                  name: 'Bolsa baú de couro caramelo',
                  price: 90,
                  coverImageUrl: null,
                  store: { id: '2', name: 'Brechó da Redenção', city: 'Porto Alegre' },
                },
                addedAt: '2026-09-26T12:00:00Z',
              },
            ],
            subtotalCents: 9000,
          },
        ],
      };
      vi.mocked(getCombinations).mockResolvedValue(LOOK);
      renderSection(cartValue({ cart, count: 1, add }));

      await user.click((await secao()).getByRole('button', { name: ADD_BOLSA }));

      expect(add).not.toHaveBeenCalled();
      expect(screen.queryByText(/Não foi possível adicionar/)).not.toBeInTheDocument();
    });

    it('clique duplo enquanto add está pendente adiciona uma vez só', async () => {
      const user = userEvent.setup();
      let resolveAdd: () => void = () => {};
      const add = vi.fn(() => new Promise<void>((resolve) => (resolveAdd = resolve)));
      vi.mocked(getCombinations).mockResolvedValue(LOOK);
      renderSection(cartValue({ add }));

      const botao = (await secao()).getByRole('button', { name: ADD_BOLSA });
      await user.click(botao);
      await user.click(botao);
      resolveAdd();

      expect(await screen.findByText('Adicionada ao carrinho')).toBeInTheDocument();
      expect(add).toHaveBeenCalledOnce();
    });
  });
});
