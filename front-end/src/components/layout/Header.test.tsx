import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Header from './Header';

afterEach(cleanup);

describe('<Header />', () => {
  it('renders the brand link to home', () => {
    render(<Header />);

    expect(screen.getByRole('link', { name: /vintex/i })).toHaveAttribute('href', '/');
  });

  it('renders the primary navigation links', () => {
    render(<Header />);

    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '/catalog');
  });

  it('renders the account area links', () => {
    render(<Header />);

    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/register');
  });

  it('hides the primary navigation on mobile and shows it from tablet up', () => {
    render(<Header />);

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveClass('hidden');
    expect(nav).toHaveClass('tablet:flex');
  });
});
