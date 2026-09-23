import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RoutePlaceholder } from './RoutePlaceholder';

afterEach(cleanup);

describe('<RoutePlaceholder />', () => {
  it('mostra o título como heading e a mensagem padrão dentro de um EmptyState', () => {
    render(<RoutePlaceholder title="Carrinho" />);

    expect(screen.getByRole('heading', { name: 'Carrinho' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('ainda não foi implementada');
  });

  it('aceita uma mensagem própria, no lugar da padrão', () => {
    render(<RoutePlaceholder title="Painel do vendedor" message="Em breve por aqui." />);

    expect(screen.getByRole('status')).toHaveTextContent('Em breve por aqui.');
  });
});
