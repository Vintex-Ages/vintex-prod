import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { AUTH_TOKEN_STORAGE_KEY } from '@/context/useAuth';
import { paths } from '@/routes/paths';
import Login from './Login';

vi.mock('@/services/authService', () => ({ login: vi.fn() }));
import { login } from '@/services/authService';

const mockedLogin = vi.mocked(login);

function PathProbe() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderLogin(
  entries: Array<{ pathname: string; state?: unknown }> = [{ pathname: '/login' }],
) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <AuthProvider>
        <PathProbe />
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function preencherEEnviar(email: string, senha: string) {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } });
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('Login', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza cabecalho, abas, campos e o botao Entrar', () => {
    renderLogin();

    expect(screen.getByText('Vintex')).toBeInTheDocument();
    expect(screen.getByText('Entre na Vintex')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar conta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Já tenho conta' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByText('Esqueceu sua senha?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('login bem-sucedido guarda user/token na sessao e navega para home (sem origem salva)', async () => {
    mockedLogin.mockResolvedValueOnce({
      user: {
        id: 'u_1',
        name: 'Ana Brechó',
        email: 'ana@exemplo.com',
        is_seller: false,
        is_admin: false,
      },
      access_token: 'tok-123',
    });
    renderLogin();

    await preencherEEnviar('ana@exemplo.com', 'senha123');

    await waitFor(() => {
      expect(window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe('tok-123');
    });
    expect(mockedLogin).toHaveBeenCalledWith({ email: 'ana@exemplo.com', password: 'senha123' });
    expect(screen.getByTestId('path')).toHaveTextContent(paths.home);
  });

  it('login bem-sucedido volta para a rota de origem guardada (location.state.from)', async () => {
    mockedLogin.mockResolvedValueOnce({
      user: {
        id: 'u_1',
        name: 'Ana Brechó',
        email: 'ana@exemplo.com',
        is_seller: false,
        is_admin: false,
      },
      access_token: 'tok-123',
    });
    renderLogin([{ pathname: '/login', state: { from: '/catalogo?q=jaqueta' } }]);

    await preencherEEnviar('ana@exemplo.com', 'senha123');

    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent('/catalogo');
    });
  });

  it('credencial invalida mostra mensagem generica, sem indicar o campo', async () => {
    mockedLogin.mockRejectedValueOnce({
      code: 'INVALID_CREDENTIALS',
      message: 'E-mail ou senha inválidos.',
    });
    renderLogin();

    await preencherEEnviar('ana@exemplo.com', 'errada');

    expect(await screen.findByText('E-mail ou senha inválidos.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Senha')).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('path')).toHaveTextContent('/login');
  });
});
