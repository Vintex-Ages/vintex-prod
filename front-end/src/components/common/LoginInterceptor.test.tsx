import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginInterceptor from './LoginInterceptor';

afterEach(cleanup);

const baseProps = {
  open: true,
  title: 'Entre para salvar seus favoritos',
  description: 'Faça login para favoritar peças, acompanhar a disponibilidade e receber alertas.',
  onLogin: () => {},
  onRegister: () => {},
  onDismiss: () => {},
};

describe('<LoginInterceptor />', () => {
  it('renderiza título e descrição quando aberto', () => {
    render(<LoginInterceptor {...baseProps} />);

    expect(screen.getByRole('heading', { name: baseProps.title })).toBeInTheDocument();
    expect(screen.getByText(baseProps.description)).toBeInTheDocument();
  });

  it('não renderiza nada quando open é false', () => {
    render(<LoginInterceptor {...baseProps} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Objetivo: garantir Entrar/Criar/Agora não.
  it('dispara onLogin ao clicar em Entrar', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<LoginInterceptor {...baseProps} onLogin={onLogin} />);

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('dispara onRegister ao clicar em Criar conta', async () => {
    const user = userEvent.setup();
    const onRegister = vi.fn();
    render(<LoginInterceptor {...baseProps} onRegister={onRegister} />);

    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  it('dispara onDismiss ao clicar em Agora não', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<LoginInterceptor {...baseProps} onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Agora não' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dispara onDismiss ao clicar em Fechar', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<LoginInterceptor {...baseProps} onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // Objetivo: garantir a acessibilidade do modal.
  it('dispara onDismiss ao pressionar Escape', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<LoginInterceptor {...baseProps} onDismiss={onDismiss} />);

    await user.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('prende o foco dentro do overlay ao tabular além do último elemento', async () => {
    const user = userEvent.setup();
    render(<LoginInterceptor {...baseProps} />);

    const closeButton = screen.getByRole('button', { name: 'Fechar' });
    const dismissButton = screen.getByRole('button', { name: 'Agora não' });

    dismissButton.focus();
    expect(dismissButton).toHaveFocus();

    await user.tab();

    expect(closeButton).toHaveFocus();
  });

  it('prende o foco dentro do overlay ao tabular para trás a partir do primeiro elemento', async () => {
    const user = userEvent.setup();
    render(<LoginInterceptor {...baseProps} />);

    const closeButton = screen.getByRole('button', { name: 'Fechar' });
    const dismissButton = screen.getByRole('button', { name: 'Agora não' });

    closeButton.focus();
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });

    expect(dismissButton).toHaveFocus();
  });

  it('move o foco para dentro do overlay ao abrir', () => {
    render(<LoginInterceptor {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
  });
});
