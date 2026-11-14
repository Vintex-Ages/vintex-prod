import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { AUTH_TOKEN_STORAGE_KEY, AUTH_USER_STORAGE_KEY } from '@/context/useAuth';
import { CartContext, type CartContextValue } from '@/context/useCart';
import * as cepService from '@/services/cepService';
import * as orderService from '@/services/orderService';
import { OrderError } from '@/services/orderService';
import type { AuthUser } from '@/types/auth';
import type { Order } from '@/types/order';
import type { Product } from '@/types/product';
import Checkout from './Checkout';

/**
 * Checkout, etapa 1 de 2 (FE-US022-1, #319): endereço, revisão e confirmação
 * do Pedido de uma loja. O carrinho é fake para contar `refresh` e `remove`:
 * o que a issue pede é que o front releia o carrinho do back depois do
 * `createOrder`, sem tirar peça por conta própria.
 */

const USER: AuthUser = {
  id: 'u_1',
  name: 'Ana',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

const LOJA = { id: '1', name: 'Brechó Mercado Público', city: 'Porto Alegre' };

const PECAS: Product[] = [
  { id: '1', name: 'Jaqueta jeans', price: 100, coverImageUrl: null, store: LOJA },
  { id: '5', name: 'Saia midi', price: 50, coverImageUrl: 'https://cdn.test/5.jpg', store: LOJA },
];

const ENDERECO = {
  zipCode: '90010-000',
  street: 'Rua dos Andradas',
  number: '500',
  neighborhood: 'Centro Histórico',
  city: 'Porto Alegre',
  state: 'RS',
};

const PEDIDO = { id: 'pedido-42' } as Order;

const spies = { refresh: vi.fn<() => Promise<void>>(), remove: vi.fn() };

function FakeCart({ children }: { children: React.ReactNode }) {
  const value: CartContextValue = {
    cart: { groups: [] },
    count: 0,
    loading: false,
    error: null,
    add: async () => {},
    remove: async (id) => spies.remove(id),
    refresh: () => spies.refresh(),
  };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function Destino({ titulo }: { titulo: string }) {
  const { pathname } = useLocation();
  return (
    <h1>
      {titulo} {pathname}
    </h1>
  );
}

function renderCheckout(state: unknown = { products: PECAS }) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[{ pathname: '/checkout', state }]}>
        <AuthProvider>
          <FakeCart>
            <Routes>
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/cart" element={<Destino titulo="Carrinho" />} />
              <Route path="/profile/orders/:id/payment" element={<Destino titulo="Pagamento" />} />
            </Routes>
          </FakeCart>
        </AuthProvider>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** Digita o CEP, espera a consulta (como na tela) e completa o resto. */
async function preencherEndereco() {
  fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '90010000' } });
  await waitFor(() => expect(screen.getByLabelText('Cidade')).toHaveValue(ENDERECO.city));
  fireEvent.change(screen.getByLabelText('Rua'), { target: { value: ENDERECO.street } });
  fireEvent.change(screen.getByLabelText('Número'), { target: { value: ENDERECO.number } });
  fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: ENDERECO.neighborhood } });
  fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: ENDERECO.city } });
  fireEvent.change(screen.getByLabelText('UF'), { target: { value: ENDERECO.state } });
}

const confirmar = () => screen.getByRole('button', { name: 'Confirmar pedido' });

beforeEach(() => {
  window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(USER));
  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, 'tok');
  spies.refresh.mockResolvedValue();
  vi.spyOn(orderService, 'getDeliveryAddressDefault').mockResolvedValue(null);
  vi.spyOn(orderService, 'createOrder').mockResolvedValue(PEDIDO);
  vi.spyOn(cepService, 'lookupAddress').mockResolvedValue({
    street: ENDERECO.street,
    neighborhood: ENDERECO.neighborhood,
    city: ENDERECO.city,
    state: ENDERECO.state,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  spies.refresh.mockReset();
  spies.remove.mockReset();
  window.sessionStorage.clear();
});

describe('Checkout', () => {
  it('mostra a etapa, a loja e as peças com miniatura, nome e preço', async () => {
    renderCheckout();

    expect(await screen.findByText('Etapa 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Brechó Mercado Público' })).toBeInTheDocument();
    expect(screen.getByText('Jaqueta jeans')).toBeInTheDocument();
    expect(screen.getByText('Saia midi')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Saia midi' })).toHaveAttribute(
      'src',
      'https://cdn.test/5.jpg',
    );
    expect(screen.getByText('R$ 100,00')).toBeInTheDocument();
  });

  // Objetivo declarado 2: RN-16, a comissão aparece sem ser somada ao total.
  it('o detalhamento mostra a comissão sem somá-la ao total', async () => {
    renderCheckout();

    const resumo = await screen.findByRole('region', { name: 'Resumo do pedido' });
    expect(resumo).toHaveTextContent('PeçasR$ 150,00');
    expect(resumo).toHaveTextContent('Comissão da plataforma (9%)R$ 13,50');
    expect(resumo).toHaveTextContent('paga pelo vendedor — não entra no seu total');
    expect(resumo).toHaveTextContent('Total a pagarR$ 150,00');
  });

  it('pré-preenche o endereço com o último usado', async () => {
    vi.mocked(orderService.getDeliveryAddressDefault).mockResolvedValue(ENDERECO);
    renderCheckout();

    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue(ENDERECO.street));
    expect(screen.getByLabelText('CEP')).toHaveValue('90010-000');
    expect(screen.getByLabelText('Bairro')).toHaveValue(ENDERECO.neighborhood);
    expect(orderService.getDeliveryAddressDefault).toHaveBeenCalledWith(USER.id);
  });

  // Objetivo declarado 4: o carrinho é relido do back, sem remoção local.
  it('confirmar cria o Pedido, relê o carrinho e vai ao pagamento', async () => {
    renderCheckout();
    await screen.findByText('Etapa 1 de 2');
    await preencherEndereco();

    fireEvent.click(confirmar());

    expect(
      await screen.findByText('Pagamento /profile/orders/pedido-42/payment'),
    ).toBeInTheDocument();
    expect(orderService.createOrder).toHaveBeenCalledWith(USER.id, {
      productIds: ['1', '5'],
      deliveryAddress: { ...ENDERECO, zipCode: '90010000', complement: undefined },
    });
    expect(spies.refresh).toHaveBeenCalled();
    expect(spies.remove).not.toHaveBeenCalled();
  });

  it('não envia duas vezes: o botão fica desabilitado durante o envio', async () => {
    let concluir!: (order: Order) => void;
    vi.mocked(orderService.createOrder).mockReturnValue(
      new Promise<Order>((resolve) => (concluir = resolve)),
    );
    renderCheckout();
    await screen.findByText('Etapa 1 de 2');
    await preencherEndereco();

    fireEvent.click(confirmar());
    fireEvent.click(screen.getByRole('button', { name: 'Confirmando…' }));

    expect(screen.getByRole('button', { name: 'Confirmando…' })).toBeDisabled();
    expect(orderService.createOrder).toHaveBeenCalledTimes(1);
    concluir(PEDIDO);
    await screen.findByText(/Pagamento/);
  });

  it('endereço incompleto mostra os erros e não chama createOrder', async () => {
    renderCheckout();
    await screen.findByText('Etapa 1 de 2');

    fireEvent.click(confirmar());

    await waitFor(() =>
      expect(screen.getByLabelText('CEP')).toHaveAccessibleDescription(/Informe um CEP válido\./),
    );
    expect(screen.getByLabelText('Rua')).toHaveAccessibleDescription(/Informe a rua\./);
    // `FormErrorSummary` (ADR 0003): o primeiro campo com erro recebe o foco.
    expect(screen.getByLabelText('CEP')).toHaveFocus();
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  // Objetivo declarado 3: peça única, 409 PIECE_UNAVAILABLE volta ao carrinho.
  it('PIECE_UNAVAILABLE avisa e volta ao carrinho', async () => {
    vi.mocked(orderService.createOrder).mockRejectedValue(
      new OrderError('PIECE_UNAVAILABLE', 'A peça "Saia midi" não está mais disponível.'),
    );
    renderCheckout();
    await screen.findByText('Etapa 1 de 2');
    await preencherEndereco();

    fireEvent.click(confirmar());

    expect(await screen.findByText('Carrinho /cart')).toBeInTheDocument();
    expect(screen.getByText('Uma das peças não está mais disponível')).toBeInTheDocument();
    expect(spies.remove).not.toHaveBeenCalled();
  });

  it('STORE_WITHOUT_PIX bloqueia com a mensagem do brechó, sem erro genérico', async () => {
    vi.mocked(orderService.createOrder).mockRejectedValue(
      new OrderError('STORE_WITHOUT_PIX', 'A loja ainda não cadastrou uma chave Pix.'),
    );
    renderCheckout();
    await screen.findByText('Etapa 1 de 2');
    await preencherEndereco();

    fireEvent.click(confirmar());

    expect(
      await screen.findByText('Este brechó ainda não cadastrou a chave Pix'),
    ).toBeInTheDocument();
    expect(confirmar()).toBeDisabled();
    expect(screen.queryByText(/Não foi possível confirmar/)).not.toBeInTheDocument();
  });

  it('outro erro mostra o aviso genérico e deixa tentar de novo', async () => {
    vi.mocked(orderService.createOrder).mockRejectedValueOnce(new Error('rede fora'));
    renderCheckout();
    await screen.findByText('Etapa 1 de 2');
    await preencherEndereco();

    fireEvent.click(confirmar());

    expect(
      await screen.findByText('Não foi possível confirmar o pedido. Tente de novo.'),
    ).toBeInTheDocument();
    expect(confirmar()).toBeEnabled();
  });

  it('sem as peças na navegação (F5), volta ao carrinho com aviso', async () => {
    renderCheckout(null);

    expect(await screen.findByText('Carrinho /cart')).toBeInTheDocument();
    expect(
      screen.getByText('Escolha de novo as peças no carrinho para continuar a compra.'),
    ).toBeInTheDocument();
  });
});
