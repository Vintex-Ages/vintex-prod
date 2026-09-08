import { fireEvent, render, screen } from '@testing-library/react';
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

  it('chama onLogin ao clicar em Entrar', () => {
    const onLogin = vi.fn();

    render(<AccountMenu authenticated={false} onLogin={onLogin} onRegister={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(onLogin).toHaveBeenCalledTimes(1);
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

  it('chama onSelect ao clicar em um item do menu', () => {
    const onSelect = vi.fn();

    render(
      <AccountMenu
        authenticated
        items={[{ label: 'Favoritos', onSelect }]}
        onLogout={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Favoritos' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('chama onLogout ao clicar em Sair', () => {
    const onLogout = vi.fn();

    render(<AccountMenu authenticated onLogout={onLogout} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
