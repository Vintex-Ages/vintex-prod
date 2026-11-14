import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FooterLink } from './FooterLink';

describe('FooterLink', () => {
  it('renderiza o texto auxiliar e o link corretamente', () => {
    render(<FooterLink text="Não tem conta?" linkLabel="Criar uma" to="/signup" />);

    expect(screen.getByText('Não tem conta?')).toBeInTheDocument();
    expect(screen.getByText('Criar uma')).toBeInTheDocument();
  });

  it('renderiza um link com o href correto quando "to" é informado', () => {
    render(<FooterLink text="Não tem conta?" linkLabel="Criar uma" to="/signup" />);

    const link = screen.getByRole('link', { name: 'Criar uma' });
    expect(link).toHaveAttribute('href', '/signup');
  });

  it('dispara onClick quando "to" não é informado', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(<FooterLink text="Não tem conta?" linkLabel="Criar uma" onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Criar uma' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
