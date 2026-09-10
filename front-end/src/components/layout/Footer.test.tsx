import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Footer from './Footer';

afterEach(cleanup);

describe('<Footer />', () => {
  it('renders as the page contentinfo landmark', () => {
    render(<Footer />);

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders the navigation links', () => {
    render(<Footer />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '/catalog');
  });

  it('stacks in a column on mobile and switches to a row from tablet up', () => {
    render(<Footer />);

    const content = screen.getByRole('contentinfo').firstElementChild;
    expect(content).toHaveClass('flex-col');
    expect(content).toHaveClass('tablet:flex-row');
  });
});
