import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { ToastProvider } from '@/context/ToastContext';
import { CepError, lookupAddress } from '@/services/cepService';
import { createStore, getMyStore, StoreError } from '@/services/storeService';
import type { StoreProfile } from '@/types/store';
import Sell from './Sell';

vi.mock('@/services/storeService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storeService')>()),
  createStore: vi.fn(),
  getMyStore: vi.fn(),
}));

vi.mock('@/services/cepService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/cepService')>()),
  lookupAddress: vi.fn(),
}));

const STORE: StoreProfile = {
  id: 'store-1',
  name: 'Brechó da Ana',
  description: 'Peças garimpadas.',
  logoUrl: null,
  city: 'Porto Alegre',
  state: 'RS',
  verification: 'pendente',
  createdAt: '2026-09-01T00:00:00.000Z',
};

const refreshUser = vi.fn<() => Promise<void>>();

function renderSell() {
  const auth: AuthContextValue = {
    user: { id: 'u_1', name: 'Ana', email: 'ana@exemplo.com', is_seller: false, is_admin: false },
    token: 'token',
    isAuthenticated: true,
    loading: false,
    login: () => {},
    logout: () => {},
    refreshUser,
  };
  return render(
    <AuthContext.Provider value={auth}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/sell']}>
          <Routes>
            <Route path="/sell" element={<Sell />} />
            <Route path="/seller" element={<h1>Painel do vendedor</h1>} />
            <Route path="/" element={<h1>Home</h1>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>,
  );
}

/** Abre `/sell` e aceita o contrato de venda (FE-US003b-1) para chegar ao formulário. */
async function renderForm() {
  const utils = renderSell();
  const user = userEvent.setup({ delay: null });
  const aceitar = await screen.findByRole('button', { name: 'Aceitar' });
  // O modal habilita o Aceitar depois de medir o texto; clicar antes não faz nada.
  await waitFor(() => expect(aceitar).toBeEnabled());
  await user.click(aceitar);
  await screen.findByRole('button', { name: 'Abrir minha loja' });
  return utils;
}

beforeEach(() => {
  refreshUser.mockReset().mockResolvedValue(undefined);
  vi.mocked(getMyStore).mockReset().mockResolvedValue(null);
  vi.mocked(createStore).mockReset().mockResolvedValue(STORE);
  vi.mocked(lookupAddress)
    .mockReset()
    .mockResolvedValue({
      street: '',
      neighborhood: 'Bom Fim',
      city: 'Porto Alegre',
      state: 'RS',
    });
});

afterEach(cleanup);

describe('<Sell />', () => {
  it('Teste 1 (RN-29, RN-31): preencher e enviar cria a loja e leva ao painel com boas-vindas', async () => {
    const user = userEvent.setup({ delay: null });
    await renderForm();

    await user.type(screen.getByLabelText('Nome da loja'), 'Brechó da Ana');
    await user.type(screen.getByLabelText('Descrição (opcional)'), 'Peças garimpadas.');
    await user.type(screen.getByLabelText('Número do CPF'), '52998224725');
    await user.type(screen.getByLabelText('CEP'), '90035072');

    // CEP → endereço: bairro, cidade e UF chegam preenchidos.
    await waitFor(() => expect(screen.getByLabelText('Bairro')).toHaveValue('Bom Fim'));
    expect(screen.getByLabelText('Cidade')).toHaveValue('Porto Alegre');
    expect(screen.getByLabelText('UF')).toHaveValue('RS');

    await user.type(screen.getByLabelText('Rua'), 'Rua Ramiro Barcelos');
    await user.type(screen.getByLabelText('Número'), '2350');
    await user.type(screen.getByLabelText('Chave Pix'), 'ana@exemplo.com');
    await user.click(screen.getByRole('button', { name: 'Abrir minha loja' }));

    expect(await screen.findByRole('heading', { name: 'Painel do vendedor' })).toBeInTheDocument();
    expect(createStore).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Brechó da Ana',
        document: { type: 'cpf', number: '52998224725' },
        pixKey: 'ana@exemplo.com',
        acceptedContractVersion: 'contrato-0.1-placeholder',
      }),
    );
    expect(refreshUser).toHaveBeenCalled();
    expect(
      screen.getByText('Boas-vindas! Sua loja Brechó da Ana está aberta.'),
    ).toBeInTheDocument();
  });

  it('Teste 2 (RN-30): alternar CPF/CNPJ muda a máscara e a validação', async () => {
    const user = userEvent.setup({ delay: null });
    await renderForm();

    expect(screen.getByRole('radio', { name: 'CPF' })).toBeChecked();
    await user.type(screen.getByLabelText('Número do CPF'), '52998224725');
    expect(screen.getByLabelText('Número do CPF')).toHaveValue('529.982.247-25');

    await user.click(screen.getByRole('radio', { name: 'CNPJ' }));
    const cnpj = screen.getByLabelText('Número do CNPJ');
    expect(cnpj).toHaveAttribute('placeholder', '00.000.000/0000-00');
    expect(cnpj).toHaveValue('52.998.224/725');

    // O mesmo número, válido como CPF, não passa como CNPJ.
    await user.click(screen.getByRole('button', { name: 'Abrir minha loja' }));
    expect(cnpj).toHaveAccessibleDescription('CNPJ inválido. Confira os 14 dígitos.');
    expect(cnpj).toHaveAttribute('aria-invalid', 'true');

    await user.clear(cnpj);
    await user.type(cnpj, '11222333000181');
    expect(cnpj).toHaveValue('11.222.333/0001-81');
    expect(cnpj).toHaveAttribute('aria-invalid', 'false');
  });

  it('Teste 3 (P-06): quem já tem loja é redirecionado ao painel', async () => {
    vi.mocked(getMyStore).mockResolvedValue(STORE);
    renderSell();

    expect(await screen.findByRole('heading', { name: 'Painel do vendedor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir minha loja' })).not.toBeInTheDocument();
  });

  it('mostra o carregamento enquanto confere se já existe loja', () => {
    vi.mocked(getMyStore).mockReturnValue(new Promise(() => {}));
    renderSell();

    expect(screen.getByRole('status')).toHaveTextContent('Verificando sua loja…');
    expect(screen.queryByRole('heading', { name: 'Quero vender' })).not.toBeInTheDocument();
  });

  it('falha ao conferir a loja mostra erro com "tentar de novo"', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(getMyStore).mockRejectedValueOnce(new StoreError('INTERNAL_ERROR', 'x'));
    renderSell();

    expect(await screen.findByText('Não foi possível verificar sua loja.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /tentar/i }));

    expect(await screen.findByRole('heading', { name: 'Quero vender' })).toBeInTheDocument();
  });

  it('envio vazio mostra a mensagem em cada campo, sem chamar o back', async () => {
    const user = userEvent.setup({ delay: null });
    await renderForm();

    await user.click(screen.getByRole('button', { name: 'Abrir minha loja' }));

    expect(screen.getByLabelText('Nome da loja')).toHaveAccessibleDescription(
      'Informe o nome da loja.',
    );
    expect(screen.getByLabelText('Número do CPF')).toHaveAccessibleDescription('Informe o CPF.');
    expect(screen.getByLabelText('CEP')).toHaveAccessibleDescription('Informe um CEP válido.');
    expect(screen.getByLabelText('Chave Pix')).toHaveAccessibleDescription('Informe a chave Pix.');
    expect(screen.getByLabelText('UF')).toHaveAccessibleDescription('Selecione a UF.');
    expect(createStore).not.toHaveBeenCalled();
  });

  // #283: eram nove `role="alert"` no mesmo render e o foco ficava no botão.
  it('envio vazio anuncia um resumo só e leva o foco ao primeiro campo inválido', async () => {
    const user = userEvent.setup({ delay: null });
    await renderForm();

    await user.click(screen.getByRole('button', { name: 'Abrir minha loja' }));

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Confira 9 campos antes de continuar:');
    expect(screen.getByLabelText('Nome da loja')).toHaveFocus();

    // O link do resumo leva ao campo.
    await user.click(screen.getByRole('link', { name: 'Informe a chave Pix.' }));
    expect(screen.getByLabelText('Chave Pix')).toHaveFocus();
  });

  it('CEP inexistente aparece no próprio campo', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(lookupAddress).mockResolvedValue(null);
    await renderForm();

    await user.type(screen.getByLabelText('CEP'), '99999999');

    await waitFor(() =>
      expect(screen.getByLabelText('CEP')).toHaveAccessibleDescription('CEP não encontrado.'),
    );
  });

  it('CEP fora do ar avisa e deixa preencher o endereço à mão', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(lookupAddress).mockRejectedValue(new CepError('fora'));
    await renderForm();

    await user.type(screen.getByLabelText('CEP'), '90035072');

    await waitFor(() =>
      expect(screen.getByLabelText('CEP')).toHaveAccessibleDescription(
        'Não foi possível consultar o CEP agora. Preencha o endereço abaixo.',
      ),
    );
    expect(screen.getByLabelText('Bairro')).toBeEnabled();
  });

  it('endereço digitado à mão e logo anexada chegam ao createStore', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(lookupAddress).mockRejectedValue(new CepError('fora'));
    // jsdom não implementa `createObjectURL`, que o MediaUploader usa na prévia.
    Object.defineProperty(URL, 'createObjectURL', { writable: true, value: () => 'blob:logo' });
    const logo = new File(['logo'], 'logo.png', { type: 'image/png' });
    await renderForm();

    await user.type(screen.getByLabelText('Nome da loja'), 'Brechó da Ana');
    await user.upload(screen.getByLabelText('Logo (opcional)'), logo);
    await user.type(screen.getByLabelText('Número do CPF'), '52998224725');
    await user.type(screen.getByLabelText('CEP'), '90035072');
    await waitFor(() =>
      expect(screen.getByLabelText('CEP')).toHaveAccessibleDescription(/Preencha o endereço/),
    );
    await user.type(screen.getByLabelText('Rua'), 'Rua Ramiro Barcelos');
    await user.type(screen.getByLabelText('Número'), '2350');
    await user.type(screen.getByLabelText('Complemento'), 'Sala 2');
    await user.type(screen.getByLabelText('Bairro'), 'Bom Fim');
    await user.type(screen.getByLabelText('Cidade'), 'Porto Alegre');
    await user.selectOptions(screen.getByLabelText('UF'), 'RS');
    await user.type(screen.getByLabelText('Chave Pix'), 'ana@exemplo.com');
    await user.click(screen.getByRole('button', { name: 'Abrir minha loja' }));

    await screen.findByRole('heading', { name: 'Painel do vendedor' });
    expect(createStore).toHaveBeenCalledWith(
      expect.objectContaining({
        logo,
        address: {
          cep: '90035072',
          street: 'Rua Ramiro Barcelos',
          number: '2350',
          complement: 'Sala 2',
          district: 'Bom Fim',
          city: 'Porto Alegre',
          state: 'RS',
        },
      }),
    );
  });

  it('erro do back ao criar aparece como aviso do formulário', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(createStore).mockRejectedValue(
      new StoreError('STORE_ALREADY_EXISTS', 'Você já tem uma loja.'),
    );
    await renderForm();

    await user.type(screen.getByLabelText('Nome da loja'), 'Brechó da Ana');
    await user.type(screen.getByLabelText('Número do CPF'), '52998224725');
    await user.type(screen.getByLabelText('CEP'), '90035072');
    await waitFor(() => expect(screen.getByLabelText('Bairro')).toHaveValue('Bom Fim'));
    await user.type(screen.getByLabelText('Rua'), 'Rua Ramiro Barcelos');
    await user.type(screen.getByLabelText('Número'), '2350');
    await user.type(screen.getByLabelText('Chave Pix'), 'ana@exemplo.com');
    await user.click(screen.getByRole('button', { name: 'Abrir minha loja' }));

    expect(await screen.findByText('Você já tem uma loja.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir minha loja' })).toBeEnabled();
  });

  describe('contrato de venda (FE-US003b-1)', () => {
    it('abre o contrato antes do formulário, com Aceitar esperando a rolagem até o fim', async () => {
      renderSell();

      expect(await screen.findByRole('dialog', { name: 'Contrato de venda' })).toBeInTheDocument();
      expect(screen.getByText('Versão contrato-0.1-placeholder')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Abrir minha loja' })).toBeNull();
    });

    // Objetivo declarado: garantir o registro separado (RN-93).
    it('Aceitar libera o formulário', async () => {
      await renderForm();

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByLabelText('Nome da loja')).toBeInTheDocument();
    });

    // Objetivo declarado: garantir "sem aceite do contrato, sem loja".
    it('Não aceitar volta à Home com aviso e não cria loja', async () => {
      const user = userEvent.setup({ delay: null });
      renderSell();

      await user.click(await screen.findByRole('button', { name: 'Não aceitar' }));

      expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
      expect(
        screen.getByText('Sem aceitar o contrato de venda não dá para abrir uma loja.'),
      ).toBeInTheDocument();
      expect(createStore).not.toHaveBeenCalled();
    });
  });
});