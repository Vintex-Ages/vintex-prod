import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import AppRoutes from './AppRoutes';
import { paths, productDetail } from './paths';

afterEach(cleanup);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('<AppRoutes />', () => {
  it.each([
    [paths.home, 'Início'],
    [paths.catalog, 'Catálogo'],
    [productDetail('1'), 'Nike Camiseta Preto'],
    [paths.login, 'Entrar'],
    [paths.register, 'Entre na sua conta'],
    [paths.onboarding, 'Onboarding'],
  ])('renders the page mapped to %s', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('falls back to the 404 page for an unknown route', () => {
    renderAt('/rota-que-nao-existe');
    expect(screen.getByRole('heading', { name: /não encontrada/i })).toBeInTheDocument();
  });

  /**
   * RN-26 (FE-US005-3, #75): visitante sem cadastro explora o app sem
   * precisar logar. As rotas de descoberta continuam navegáveis mesmo depois
   * dos guardas de rota entrarem no projeto — nenhuma delas deve ganhar
   * RequireAuth/RequireRole no futuro sem que este teste seja atualizado de
   * propósito.
   *
   * A 4ª rota citada no critério de aceite da issue ("perfil de loja") ainda
   * não existe no front-end (sem página, sem rota) — não há como testá-la
   * ainda. As 3 rotas de descoberta já implementadas estão cobertas abaixo.
   */
  it.each([
    [paths.home, 'Início'],
    [paths.catalog, 'Catálogo'],
    [productDetail('1'), 'Nike Camiseta Preto'],
  ])('RN-26: %s continua acessível sem login', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });
});
