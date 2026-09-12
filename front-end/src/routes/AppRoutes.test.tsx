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
});
