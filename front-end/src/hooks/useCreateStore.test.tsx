import type { ReactNode } from 'react';
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { ToastProvider } from '@/context/ToastContext';
import { CepError, lookupAddress } from '@/services/cepService';
import { createStore, getMyStore, StoreError } from '@/services/storeService';
import type { StoreProfile } from '@/types/store';
import { useCreateStore } from './useCreateStore';

const navigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

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

function wrapper({ children }: { children: ReactNode }) {
  const auth: AuthContextValue = {
    user: { id: 'u_1', name: 'Ana', email: 'ana@exemplo.com', is_seller: false, is_admin: false },
    token: 'token',
    isAuthenticated: true,
    loading: false,
    login: () => {},
    logout: () => {},
    refreshUser,
  };
  return (
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <ToastProvider>{children}</ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

/** Renderiza o hook e espera a checagem de loja terminar (sem loja, por padrão). */
async function renderReady() {
  const hook = renderHook(() => useCreateStore(), { wrapper });
  await waitFor(() => expect(hook.result.current.access).toBe('ready'));
  return hook;
}

type Hook = Awaited<ReturnType<typeof renderReady>>;

/** Preenche um formulário válido, com o CEP já resolvido. */
async function fillValid({ result }: Hook) {
  act(() => {
    result.current.setField('name', '  Brechó da Ana  ');
    result.current.setField('description', 'Peças garimpadas.');
    result.current.setField('documentNumber', '52998224725');
    result.current.setField('cep', '90035072');
  });
  await waitFor(() => expect(result.current.cepStatus).toBe('resolved'));
  act(() => {
    result.current.setField('street', 'Rua Ramiro Barcelos');
    result.current.setField('number', '2350');
    result.current.setField('pixKey', ' ana@exemplo.com ');
  });
}

beforeEach(() => {
  navigate.mockReset();
  refreshUser.mockReset().mockResolvedValue(undefined);
  vi.mocked(getMyStore).mockReset().mockResolvedValue(null);
  vi.mocked(createStore).mockReset().mockResolvedValue(STORE);
  vi.mocked(lookupAddress).mockReset().mockResolvedValue({
    street: '',
    neighborhood: 'Bom Fim',
    city: 'Porto Alegre',
    state: 'RS',
  });
});

afterEach(cleanup);

describe('useCreateStore — acesso à tela (P-06)', () => {
  it('começa checando a loja e libera o formulário para quem não tem', async () => {
    const { result } = renderHook(() => useCreateStore(), { wrapper });

    expect(result.current.access).toBe('checking');
    await waitFor(() => expect(result.current.access).toBe('ready'));
  });

  it('quem já tem loja fica em `has-store` (a tela redireciona ao painel)', async () => {
    vi.mocked(getMyStore).mockResolvedValue(STORE);

    const { result } = renderHook(() => useCreateStore(), { wrapper });

    await waitFor(() => expect(result.current.access).toBe('has-store'));
  });

  it('falha na checagem vira `error`, e tentar de novo refaz a consulta', async () => {
    vi.mocked(getMyStore).mockRejectedValueOnce(new StoreError('INTERNAL_ERROR', 'falhou'));

    const { result } = renderHook(() => useCreateStore(), { wrapper });
    await waitFor(() => expect(result.current.access).toBe('error'));

    act(() => result.current.retryAccess());

    await waitFor(() => expect(result.current.access).toBe('ready'));
    expect(getMyStore).toHaveBeenCalledTimes(2);
  });
});

describe('useCreateStore — documento (RN-30)', () => {
  it('aplica a máscara do CPF por padrão', async () => {
    const { result } = await renderReady();

    act(() => result.current.setField('documentNumber', '52998224725'));

    expect(result.current.values.documentType).toBe('cpf');
    expect(result.current.values.documentNumber).toBe('529.982.247-25');
  });

  it('alternar para CNPJ troca a máscara e mantém os dígitos que cabem', async () => {
    const { result } = await renderReady();

    act(() => result.current.setField('documentNumber', '11222333000'));
    act(() => result.current.setDocumentType('cnpj'));

    expect(result.current.values.documentNumber).toBe('11.222.333/000');

    act(() => result.current.setField('documentNumber', '11222333000181'));
    expect(result.current.values.documentNumber).toBe('11.222.333/0001-81');
  });

  it('valida pelo tipo escolhido: CPF válido não passa como CNPJ', async () => {
    const hook = await renderReady();
    await fillValid(hook);
    const { result } = hook;

    act(() => result.current.setDocumentType('cnpj'));
    await act(() => result.current.submit());

    expect(result.current.errors.documentNumber).toBe('CNPJ inválido. Confira os 14 dígitos.');
    expect(createStore).not.toHaveBeenCalled();
  });

  it('trocar o tipo limpa o erro do documento', async () => {
    const { result } = await renderReady();
    await act(() => result.current.submit());
    expect(result.current.errors.documentNumber).toBe('Informe o CPF.');

    act(() => result.current.setDocumentType('cnpj'));

    expect(result.current.errors.documentNumber).toBeUndefined();
  });

  // #283: a troca CNPJ → CPF cortava os dígitos e limpava o erro, calada.
  it('trocar CNPJ → CPF corta para 11 dígitos e acusa o erro na hora', async () => {
    const { result } = await renderReady();
    act(() => result.current.setDocumentType('cnpj'));
    act(() => result.current.setField('documentNumber', '11222333000181'));

    act(() => result.current.setDocumentType('cpf'));

    expect(result.current.values.documentNumber).toBe('112.223.330-00');
    expect(result.current.errors.documentNumber).toBe('CPF inválido. Confira os 11 dígitos.');
  });

  it('o corte acusa mesmo quando os 11 dígitos que sobram formam um CPF válido', async () => {
    const { result } = await renderReady();
    act(() => result.current.setDocumentType('cnpj'));
    act(() => result.current.setField('documentNumber', '52998224725000'));

    act(() => result.current.setDocumentType('cpf'));

    expect(result.current.values.documentNumber).toBe('529.982.247-25');
    expect(result.current.errors.documentNumber).toBe('CPF inválido. Confira os 11 dígitos.');
  });

  it('trocar CPF → CNPJ com número que não fecha 14 dígitos acusa na hora', async () => {
    const { result } = await renderReady();
    act(() => result.current.setField('documentNumber', '52998224725'));

    act(() => result.current.setDocumentType('cnpj'));

    expect(result.current.errors.documentNumber).toBe('CNPJ inválido. Confira os 14 dígitos.');
  });
});

describe('useCreateStore — CEP → endereço', () => {
  it('com 8 dígitos, busca o CEP e preenche bairro, cidade e UF', async () => {
    const { result } = await renderReady();

    act(() => result.current.setField('cep', '90035072'));

    expect(result.current.values.cep).toBe('90035-072');
    expect(result.current.cepStatus).toBe('loading');
    await waitFor(() => expect(result.current.cepStatus).toBe('resolved'));
    expect(lookupAddress).toHaveBeenCalledWith('90035072');
    expect(result.current.values).toMatchObject({
      district: 'Bom Fim',
      city: 'Porto Alegre',
      state: 'RS',
    });
  });

  it('antes dos 8 dígitos, não consulta', async () => {
    const { result } = await renderReady();

    act(() => result.current.setField('cep', '9003507'));

    expect(result.current.cepStatus).toBe('idle');
    expect(lookupAddress).not.toHaveBeenCalled();
  });

  it('CEP inexistente mostra o erro no campo e bloqueia o envio', async () => {
    vi.mocked(lookupAddress).mockResolvedValue(null);
    const hook = await renderReady();
    const { result } = hook;

    act(() => result.current.setField('cep', '99999999'));

    await waitFor(() => expect(result.current.cepStatus).toBe('not_found'));
    expect(result.current.errors.cep).toBe('CEP não encontrado.');

    await act(() => result.current.submit());
    expect(result.current.errors.cep).toBe('CEP não encontrado.');
    expect(createStore).not.toHaveBeenCalled();
  });

  it('se a consulta cair, o endereço pode ser preenchido à mão e o envio segue', async () => {
    vi.mocked(lookupAddress).mockRejectedValue(new CepError('fora do ar'));
    const { result } = await renderReady();

    act(() => {
      result.current.setField('name', 'Brechó da Ana');
      result.current.setField('documentNumber', '52998224725');
      result.current.setField('cep', '90035072');
    });
    await waitFor(() => expect(result.current.cepStatus).toBe('error'));
    expect(result.current.errors.cep).toBeUndefined();

    act(() => {
      result.current.setField('street', 'Rua Ramiro Barcelos');
      result.current.setField('number', '2350');
      result.current.setField('district', 'Bom Fim');
      result.current.setField('city', 'Porto Alegre');
      result.current.setField('state', 'RS');
      result.current.setField('pixKey', 'ana@exemplo.com');
    });
    await act(() => result.current.submit());

    expect(result.current.errors).toEqual({});
    expect(createStore).toHaveBeenCalled();
  });

  // #283: o endereço do CEP anterior seguia com o CEP novo (SP com cidade de POA).
  it('CEP que falha depois de um que resolveu limpa bairro, cidade e UF', async () => {
    const hook = await renderReady();
    await fillValid(hook);
    const { result } = hook;
    expect(result.current.values.city).toBe('Porto Alegre');

    vi.mocked(lookupAddress).mockRejectedValueOnce(new CepError('fora do ar'));
    act(() => result.current.setField('cep', '01001000'));
    await waitFor(() => expect(result.current.cepStatus).toBe('error'));

    expect(result.current.values).toMatchObject({ district: '', city: '', state: null });

    await act(() => result.current.submit());
    expect(result.current.errors).toMatchObject({
      district: 'Informe o bairro.',
      city: 'Informe a cidade.',
      state: 'Selecione a UF.',
    });
    expect(createStore).not.toHaveBeenCalled();
  });
});

describe('useCreateStore — validação por campo', () => {
  it('envio vazio marca cada campo obrigatório com a sua mensagem', async () => {
    const { result } = await renderReady();

    await act(() => result.current.submit());

    expect(result.current.errors).toEqual({
      name: 'Informe o nome da loja.',
      documentNumber: 'Informe o CPF.',
      cep: 'Informe um CEP válido.',
      street: 'Informe a rua.',
      number: 'Informe o número.',
      district: 'Informe o bairro.',
      city: 'Informe a cidade.',
      state: 'Selecione a UF.',
      pixKey: 'Informe a chave Pix.',
    });
    expect(createStore).not.toHaveBeenCalled();
  });

  it('CPF com dígito verificador errado é recusado', async () => {
    const hook = await renderReady();
    await fillValid(hook);
    const { result } = hook;

    act(() => result.current.setField('documentNumber', '52998224724'));
    await act(() => result.current.submit());

    expect(result.current.errors.documentNumber).toBe('CPF inválido. Confira os 11 dígitos.');
  });

  it('Pix só com espaços conta como vazio', async () => {
    const hook = await renderReady();
    await fillValid(hook);
    const { result } = hook;

    act(() => result.current.setField('pixKey', '   '));
    await act(() => result.current.submit());

    expect(result.current.errors.pixKey).toBe('Informe a chave Pix.');
  });

  it('editar um campo com erro apaga o erro daquele campo', async () => {
    const { result } = await renderReady();
    await act(() => result.current.submit());

    act(() => result.current.setField('name', 'B'));

    expect(result.current.errors.name).toBeUndefined();
    expect(result.current.errors.pixKey).toBe('Informe a chave Pix.');
  });
});

describe('useCreateStore — envio (RN-29, RN-31)', () => {
  it('cria a loja, atualiza a sessão, avisa e leva ao painel', async () => {
    const hook = await renderReady();
    await fillValid(hook);
    const { result } = hook;

    await act(() => result.current.submit());

    expect(createStore).toHaveBeenCalledWith({
      name: 'Brechó da Ana',
      description: 'Peças garimpadas.',
      logo: null,
      document: { type: 'cpf', number: '52998224725' },
      address: {
        cep: '90035072',
        street: 'Rua Ramiro Barcelos',
        number: '2350',
        complement: undefined,
        district: 'Bom Fim',
        city: 'Porto Alegre',
        state: 'RS',
      },
      pixKey: 'ana@exemplo.com',
    });
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/seller', { replace: true });
    expect(
      screen.getByText('Boas-vindas! Sua loja Brechó da Ana está aberta.'),
    ).toBeInTheDocument();
  });

  it('manda o arquivo da logo quando há uma', async () => {
    const hook = await renderReady();
    await fillValid(hook);
    const { result } = hook;
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });

    act(() =>
      result.current.setField('logo', [
        { id: '1', file, url: 'blob:1', type: 'image', position: 0 },
      ]),
    );
    await act(() => result.current.submit());

    expect(vi.mocked(createStore).mock.calls[0][0].logo).toBe(file);
  });

  it('se atualizar a sessão falhar, a loja já existe: vai ao painel mesmo assim', async () => {
    refreshUser.mockRejectedValue(new Error('rede'));
    const hook = await renderReady();
    await fillValid(hook);

    await act(() => hook.result.current.submit());

    expect(navigate).toHaveBeenCalledWith('/seller', { replace: true });
  });

  it('erro do back aparece como aviso do formulário e libera novo envio', async () => {
    vi.mocked(createStore).mockRejectedValue(
      new StoreError('STORE_ALREADY_EXISTS', 'Você já tem uma loja.'),
    );
    const hook = await renderReady();
    await fillValid(hook);
    const { result } = hook;

    await act(() => result.current.submit());

    expect(result.current.submitError).toBe('Você já tem uma loja.');
    expect(result.current.submitting).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('erro inesperado usa mensagem genérica', async () => {
    vi.mocked(createStore).mockRejectedValue(
      new StoreError('INTERNAL_ERROR', 'Erro ao consultar loja.'),
    );
    const hook = await renderReady();
    await fillValid(hook);

    await act(() => hook.result.current.submit());

    expect(hook.result.current.submitError).toBe(
      'Não foi possível criar sua loja agora. Tente novamente.',
    );
  });

  it('marca `submitting` enquanto a criação não volta', async () => {
    let resolve!: (store: StoreProfile) => void;
    vi.mocked(createStore).mockReturnValue(new Promise((res) => (resolve = res)));
    const hook = await renderReady();
    await fillValid(hook);
    const { result } = hook;

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit();
    });
    expect(result.current.submitting).toBe(true);

    await act(async () => {
      resolve(STORE);
      await pending;
    });
  });

  // #283: o `if (submitting)` lia o estado do render e deixava passar os dois.
  it('dois `submit()` no mesmo tick criam a loja uma vez só', async () => {
    const hook = await renderReady();
    await fillValid(hook);
    const { result } = hook;

    await act(async () => {
      await Promise.all([result.current.submit(), result.current.submit()]);
    });

    expect(createStore).toHaveBeenCalledTimes(1);
  });
});
