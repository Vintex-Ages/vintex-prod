import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Layout from './Layout';

afterEach(cleanup);

describe('<Layout />', () => {
  it('renders header, page content and footer', () => {
    render(
      <Layout>
        <p>Conteúdo da página</p>
      </Layout>,
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo da página')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('adapts the primary navigation to the mobile breakpoint', () => {
    render(<Layout>{null}</Layout>);

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveClass('hidden');
    expect(nav).toHaveClass('tablet:flex');
  });
});
