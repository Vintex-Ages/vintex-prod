import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import Layout from './Layout';

afterEach(cleanup);

function renderLayout(children: React.ReactNode, bottomSpacer = false) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Layout bottomSpacer={bottomSpacer}>{children}</Layout>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('<Layout />', () => {
  it('renders header, page content and footer', () => {
    renderLayout(<p>Conteúdo da página</p>);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo da página')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  /**
   * Sem a faixa, a barra `fixed` do detalhe da peça cobre as últimas linhas do
   * rodapé abaixo de `web`: compensar dentro do `<main>` não resolve, porque o
   * rodapé é irmão posterior do conteúdo.
   */
  it('reserva a faixa abaixo do rodapé só quando pedida', () => {
    const semFaixa = renderLayout(null);
    expect(semFaixa.container.querySelector('.h-28')).not.toBeInTheDocument();
    cleanup();

    const comFaixa = renderLayout(null, true);
    const faixa = comFaixa.container.querySelector('.h-28');
    expect(faixa).toBeInTheDocument();
    expect(faixa).toHaveClass('web:hidden');
    expect(screen.getByRole('contentinfo').compareDocumentPosition(faixa!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('mantém a navegação principal visível em todo tamanho de tela', () => {
    renderLayout(null);

    // Antes a navegacao era `hidden tablet:flex`: abaixo de 720px os dois links
    // sumiam e o catalogo so era alcancavel pelo rodape. Com a marca em `h3` em
    // vez de `h2`, os dois cabem — e dois links nao justificam um menu sanfonado.
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).not.toHaveClass('hidden');
  });
});
