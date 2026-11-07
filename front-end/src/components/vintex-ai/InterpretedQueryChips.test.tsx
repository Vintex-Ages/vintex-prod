import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InterpretedQueryChips from './InterpretedQueryChips';

afterEach(cleanup);

describe('<InterpretedQueryChips />', () => {
  // Objetivo declarado: garantir a transparência (RN-60).
  it('renderiza um chip por filtro objetivo e o texto de similaridade', () => {
    render(
      <InterpretedQueryChips
        interpreted={{
          filters: { category: 'Casacos', color: 'Preto', size: 'M', priceMin: 50, priceMax: 100 },
          similarity: 'streetwear',
        }}
        onOpenCatalog={() => {}}
      />,
    );

    const chips = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(chips).toEqual(['Casacos', 'Preto', 'Tamanho M', 'R$ 50,00 a R$ 100,00']);
    expect(screen.getByText('streetwear')).toBeInTheDocument();
  });

  it('só similaridade: mostra o texto sem chips nem "Ver no catálogo"', () => {
    render(
      <InterpretedQueryChips
        interpreted={{ filters: {}, similarity: 'boho' }}
        onOpenCatalog={() => {}}
      />,
    );

    expect(screen.queryByRole('listitem')).toBeNull();
    expect(screen.getByText('boho')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver no catálogo' })).toBeNull();
  });

  it('sem filtro nem similaridade não renderiza nada', () => {
    const { container } = render(
      <InterpretedQueryChips interpreted={{ filters: {} }} onOpenCatalog={() => {}} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('clicar num chip ou em "Ver no catálogo" abre o catálogo', async () => {
    const user = userEvent.setup();
    const onOpenCatalog = vi.fn();
    render(
      <InterpretedQueryChips
        interpreted={{ filters: { category: 'Casacos', priceMax: 100 } }}
        onOpenCatalog={onOpenCatalog}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'até R$ 100,00' }));
    await user.click(screen.getByRole('button', { name: 'Ver no catálogo' }));

    expect(onOpenCatalog).toHaveBeenCalledTimes(2);
  });
});
