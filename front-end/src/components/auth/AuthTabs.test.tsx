import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AuthTabs from './AuthTabs';

function renderTabs(active: 'login' | 'register') {
  return render(
    <MemoryRouter>
      <AuthTabs active={active} />
    </MemoryRouter>,
  );
}

describe('AuthTabs', () => {
  it('mostra os dois rotulos', () => {
    renderTabs('login');

    expect(screen.getByRole('link', { name: 'Criar conta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Já tenho conta' })).toBeInTheDocument();
  });

  it('linka para as rotas de cadastro e login', () => {
    renderTabs('login');

    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Já tenho conta' })).toHaveAttribute('href', '/login');
  });

  it('marca "Já tenho conta" como aba ativa quando active="login"', () => {
    renderTabs('login');

    expect(screen.getByRole('link', { name: 'Já tenho conta' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Criar conta' })).not.toHaveAttribute('aria-current');
  });

  it('marca "Criar conta" como aba ativa quando active="register"', () => {
    renderTabs('register');

    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Já tenho conta' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
