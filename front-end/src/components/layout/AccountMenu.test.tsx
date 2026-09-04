import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountMenu } from './AccountMenu';

describe('AccountMenu', () => {
  it('renderiza o convite quando o usuário está anônimo', () => {
    render(<AccountMenu authenticated={false} onLogin={vi.fn()} onRegister={vi.fn()} />);

    expect(
      screen.getByText(/entre para favoritar peças e acompanhar pedidos/i),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeInTheDocument();
  });

  it('renderiza os itens e sair quando o usuário está logado', () => {
    render(
      <AccountMenu
        authenticated
        user={{ name: 'Ana Beatriz' }}
        items={[
          { label: 'Favoritos', onSelect: vi.fn() },
          { label: 'Pedidos', onSelect: vi.fn() },
          { label: 'Preferências', onSelect: vi.fn() },
        ]}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.getByText('Favoritos')).toBeInTheDocument();
    expect(screen.getByText('Pedidos')).toBeInTheDocument();
    expect(screen.getByText('Preferências')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });
});
