import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import Layout from './Layout';

afterEach(cleanup);

function renderLayout(children: React.ReactNode) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Layout>{children}</Layout>
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

  it('adapts the primary navigation to the mobile breakpoint', () => {
    renderLayout(null);

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveClass('hidden');
    expect(nav).toHaveClass('tablet:flex');
  });
});
