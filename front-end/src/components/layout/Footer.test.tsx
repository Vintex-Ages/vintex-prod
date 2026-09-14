import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Footer from './Footer';

afterEach(cleanup);

/** O rodapé navega com `<Link>`, que exige um router em volta. */
function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
}

describe('<Footer />', () => {
  it('renders as the page contentinfo landmark', () => {
    renderFooter();

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders the navigation links', () => {
    renderFooter();

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '/catalog');
  });

  it('stacks in a column on mobile and switches to a row from tablet up', () => {
    renderFooter();

    const content = screen.getByRole('contentinfo').firstElementChild;
    expect(content).toHaveClass('flex-col');
    expect(content).toHaveClass('tablet:flex-row');
  });
});
