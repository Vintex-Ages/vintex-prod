import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OrderCardSkeleton } from './OrderCardSkeleton';

afterEach(cleanup);

describe('<OrderCardSkeleton />', () => {
  it('anuncia o carregamento uma vez só, com os cartões escondidos do leitor de tela', () => {
    const { container } = render(<OrderCardSkeleton count={3} />);

    expect(screen.getByRole('status', { name: 'Carregando pedidos' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });

  it('desenha três cartões por padrão e respeita quem pediu menos movimento', () => {
    const { container } = render(<OrderCardSkeleton />);

    const cards = container.querySelectorAll('[aria-hidden="true"]');
    expect(cards).toHaveLength(3);
    cards.forEach((card) =>
      expect(card).toHaveClass('animate-pulse', 'motion-reduce:animate-none'),
    );
  });
});
