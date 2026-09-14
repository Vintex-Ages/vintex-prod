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
    [paths.home, 'Feed de achados'],
    [paths.catalog, 'Catálogo'],
    [productDetail('1'), 'Nike Camiseta Preto'],
    [paths.login, 'Entre na Vintex'],
    [paths.register, 'Entre na sua conta'],
    [paths.onboarding, 'Qual é a sua estética?'],
    [paths.vintexAi, 'Conversa com a Vintex'],
  ])('renders the page mapped to %s', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  /**
   * O `Layout` (#105) existia testado e não era montado por ninguém: nenhuma
   * tela tinha marca, navegação, área de conta ou rodapé. Estes dois testes
   * travam onde ele entra — e, principalmente, onde ele NÃO entra.
   */
  it.each([paths.home, paths.catalog, productDetail('1'), paths.onboarding])(
    'veste %s com o esqueleto do app',
    async (path) => {
      renderAt(path);
      expect(await screen.findByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('contentinfo')).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    },
  );

  it.each([paths.vintexAi, paths.login, paths.register])(
    'deixa %s fora do esqueleto, com o próprio cabeçalho',
    async (path) => {
      renderAt(path);
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
    },
  );

  it('falls back to the 404 page for an unknown route', () => {
    renderAt('/rota-que-nao-existe');
    expect(screen.getByRole('heading', { name: /não encontrada/i })).toBeInTheDocument();
  });

  it('veste o 404 com o esqueleto, para quem errou a URL ter volta', () => {
    renderAt('/rota-que-nao-existe');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    // Cabeçalho e rodapé: dois caminhos de volta onde antes não havia nenhum.
    expect(screen.getAllByRole('link', { name: 'Catálogo' })).toHaveLength(2);
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
    [paths.home, 'Feed de achados'],
    [paths.catalog, 'Catálogo'],
    [productDetail('1'), 'Nike Camiseta Preto'],
  ])('RN-26: %s continua acessível sem login', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });
});
