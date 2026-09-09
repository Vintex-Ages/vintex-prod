import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from './AppRoutes';
import { paths } from './paths';

afterEach(cleanup);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe('<AppRoutes />', () => {
  it.each([
    [paths.home, 'Início'],
    [paths.catalog, 'Catálogo'],
    [paths.product, 'Produto'],
    [paths.login, 'Entrar'],
    [paths.register, 'Criar conta'],
    [paths.onboarding, 'Onboarding'],
  ])('renders the page mapped to %s', (path, heading) => {
    renderAt(path);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('falls back to the 404 page for an unknown route', () => {
    renderAt('/rota-que-nao-existe');
    expect(screen.getByRole('heading', { name: /não encontrada/i })).toBeInTheDocument();
  });
});
