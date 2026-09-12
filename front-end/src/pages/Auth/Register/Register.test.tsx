import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { AUTH_TOKEN_STORAGE_KEY } from '@/context/useAuth';
import { paths } from '@/routes/paths';
import { register } from '@/services/authService';
import { lookupAddress } from '@/services/cepService';
import { REDIRECT_STORAGE_KEY } from '@/services/httpClient';
import Register from './Register';

vi.mock('@/services/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/authService')>();
  return { ...actual, register: vi.fn() };
});

vi.mock('@/services/cepService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/cepService')>();
  return { ...actual, lookupAddress: vi.fn() };
});

const mockedRegister = vi.mocked(register);
const mockedLookup = vi.mocked(lookupAddress);

const SUBMIT_BUTTON_NAME = /criar conta e personalizar estilos/i;

/**
 * `initialEntry` aceita uma origem preservada (`state.from`), simulando o
 * redirecionamento feito por uma ação protegida (FE-US002-3). As rotas
 * extras representam os destinos possíveis do fluxo pós-cadastro:
 * onboarding (padrão), login e a origem retomada.
 */
function renderRegister(
  initialEntry: string | { pathname: string; state?: unknown } = '/register',
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path={paths.login} element={<div>Tela de login</div>} />
          <Route path={paths.onboarding} element={<div>Tela de onboarding</div>} />
          <Route path="/catalog" element={<div>Tela de catálogo</div>} />
          <Route path="/product" element={<div>Tela de produto</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Preenche tudo que é obrigatório para o submit passar na validação. */
async function preencherCamposObrigatorios(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nome completo'), 'Ana Compradora');
  await user.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com');
  await user.type(screen.getByLabelText('CEP (auto-preenchimento)'), '90035072');
  await waitFor(() => expect(screen.getByText('📍 Bom Fim, Porto Alegre — RS')).toBeTruthy());
  await user.type(screen.getByLabelText('Senha'), 'senha1234');
  await user.click(screen.getByRole('checkbox'));
}

describe('<Register />', () => {
  beforeEach(() => {
    mockedLookup.mockResolvedValue({ neighborhood: 'Bom Fim', city: 'Porto Alegre', state: 'RS' });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  // Objetivo declarado do ticket: formulário sem CPF envia nome/e-mail/senha/telefone.
  it('renderiza nome, e-mail, telefone, CEP e senha — sem campo de CPF', () => {
    renderRegister();

    expect(screen.getByLabelText('Nome completo')).toBeTruthy();
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
    expect(screen.getByLabelText('Telefone celular com DDD')).toBeTruthy();
    expect(screen.getByLabelText('CEP (auto-preenchimento)')).toBeTruthy();
    expect(screen.getByLabelText('Senha')).toBeTruthy();
    expect(screen.queryByText(/cpf/i)).toBeNull();
  });

  it('resolve o endereço ao digitar um CEP válido', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('CEP (auto-preenchimento)'), '90035072');

    await waitFor(() => expect(screen.getByText('📍 Bom Fim, Porto Alegre — RS')).toBeTruthy());
    expect(mockedLookup).toHaveBeenCalledWith('90035072');
  });

  it('mostra "CEP não encontrado" quando a busca não acha endereço', async () => {
    mockedLookup.mockResolvedValueOnce(null);
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('CEP (auto-preenchimento)'), '00000000');

    await waitFor(() => expect(screen.getByText('CEP não encontrado.')).toBeTruthy());
  });

  it('bloqueia o envio e mostra os erros quando os campos obrigatórios estão vazios', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }));

    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  // Objetivo declarado do ticket: sucesso guarda token e loga.
  it('cadastra com sucesso: chama register, loga a sessão e navega pro onboarding', async () => {
    mockedRegister.mockResolvedValueOnce({
      user: {
        id: 'u_1',
        name: 'Ana Compradora',
        email: 'ana@exemplo.com',
        is_seller: false,
        is_admin: false,
      },
      access_token: 'tok-abc',
    });
    const user = userEvent.setup();
    renderRegister();

    await preencherCamposObrigatorios(user);
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }));

    await waitFor(() => expect(screen.getByText('Tela de onboarding')).toBeTruthy());
    expect(mockedRegister).toHaveBeenCalledWith({
      name: 'Ana Compradora',
      email: 'ana@exemplo.com',
      password: 'senha1234',
      phone: undefined,
    });
    expect(window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('tok-abc');
  });

  // Critério de aceite da FE-US002-3: retomar o fluxo interrompido pelo cadastro.
  it('retorna para a origem informada pelo fluxo de autenticação (location.state.from)', async () => {
    mockedRegister.mockResolvedValueOnce({
      user: {
        id: 'u_1',
        name: 'Ana Compradora',
        email: 'ana@exemplo.com',
        is_seller: false,
        is_admin: false,
      },
      access_token: 'tok-abc',
    });
    const user = userEvent.setup();
    renderRegister({ pathname: '/register', state: { from: '/catalog?category=roupas' } });

    await preencherCamposObrigatorios(user);
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }));

    await waitFor(() => expect(screen.getByText('Tela de catálogo')).toBeTruthy());
    expect(screen.queryByText('Tela de onboarding')).toBeNull();
  });

  it('usa a origem salva no sessionStorage quando não há state de navegação, e limpa a chave', async () => {
    window.sessionStorage.setItem(REDIRECT_STORAGE_KEY, '/product?id=123');
    mockedRegister.mockResolvedValueOnce({
      user: {
        id: 'u_1',
        name: 'Ana Compradora',
        email: 'ana@exemplo.com',
        is_seller: false,
        is_admin: false,
      },
      access_token: 'tok-abc',
    });
    const user = userEvent.setup();
    renderRegister();

    await preencherCamposObrigatorios(user);
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }));

    await waitFor(() => expect(screen.getByText('Tela de produto')).toBeTruthy());
    expect(window.sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBeNull();
  });

  it('mostra a mensagem de erro do back e não navega quando o cadastro falha', async () => {
    mockedRegister.mockRejectedValueOnce({
      code: 'EMAIL_TAKEN',
      message: 'Este e-mail já está cadastrado.',
      field: 'email',
    });
    const user = userEvent.setup();
    renderRegister();

    await preencherCamposObrigatorios(user);
    await user.click(screen.getByRole('button', { name: SUBMIT_BUTTON_NAME }));

    expect(await screen.findByText('Este e-mail já está cadastrado.')).toBeTruthy();
    expect(screen.queryByText('Tela de onboarding')).toBeNull();
  });

  it('"JÁ TENHO CONTA" navega para a tela de login', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole('link', { name: 'JÁ TENHO CONTA' }));

    expect(screen.getByText('Tela de login')).toBeTruthy();
  });

  it('clicar no link "Termos de Uso" não marca o checkbox', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.click(screen.getByRole('link', { name: 'Termos de Uso' }));

    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
