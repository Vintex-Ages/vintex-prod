import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LookSuggestions } from './LookSuggestions';
import type { LookSuggestion } from '@/types/look';

afterEach(cleanup);

const exact: LookSuggestion = {
  pieces: [
    {
      id: '7',
      name: 'Bolsa Baú de Couro Caramelo',
      price: 145,
      category: 'Bolsas',
      coverImageUrl: '/img/bolsa.jpg',
      store: { id: '1', name: 'Brechó da Redenção' },
    },
    {
      id: '9',
      name: 'Calça de sarja verde',
      price: 89.9,
      category: 'Parte de baixo',
      coverImageUrl: null,
      store: { id: '2', name: 'Baú da Vó Nair' },
    },
  ],
  matchType: 'exact',
  totalAmount: 234.9,
};

function renderLook(suggestion: LookSuggestion, onAdd = vi.fn()) {
  render(
    <MemoryRouter>
      <LookSuggestions suggestion={suggestion} onAdd={onAdd} />
    </MemoryRouter>,
  );
  return onAdd;
}

describe('<LookSuggestions />', () => {
  it('exact: mostra o título, o apoio, foto, nome, loja e preço de cada peça', () => {
    renderLook(exact);

    expect(screen.getByText('Curadoria da IA Vintex')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Combine esta peça e monte o look' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sugestão harmônica baseada em estilo e textura:')).toBeInTheDocument();
    expect(screen.queryByText(/alternativas próximas/)).toBeNull();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Bolsa Baú de Couro Caramelo')).toBeInTheDocument();
    expect(within(items[0]).getByText('Brechó da Redenção')).toBeInTheDocument();
    expect(within(items[0]).getByText('R$ 145,00')).toBeInTheDocument();
    expect(items[0].querySelector('img')).toHaveAttribute('src', '/img/bolsa.jpg');
    // A loja de cada peça aparece: lojas diferentes viram Pedidos diferentes.
    expect(within(items[1]).getByText('Baú da Vó Nair')).toBeInTheDocument();
    expect(within(items[1]).getByText('R$ 89,90')).toBeInTheDocument();
  });

  it('mostra o valor total do conjunto', () => {
    renderLook(exact);

    expect(screen.getByText('Total do conjunto')).toBeInTheDocument();
    expect(screen.getByText('R$ 234,90')).toBeInTheDocument();
  });

  it('fallback: mostra a linha de alternativa no lugar do apoio', () => {
    renderLook({ ...exact, matchType: 'fallback' });

    expect(
      screen.getByText('Não achamos combinações exatas: estas são alternativas próximas.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/baseada em estilo e textura/)).toBeNull();
    // As peças continuam aparecendo, com o total.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('R$ 234,90')).toBeInTheDocument();
  });

  it('lista vazia não renderiza a seção, nem o título', () => {
    const { container } = render(
      <MemoryRouter>
        <LookSuggestions
          suggestion={{ pieces: [], matchType: 'fallback', totalAmount: 0 }}
          onAdd={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Curadoria da IA Vintex')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('cada peça leva ao detalhe dela', () => {
    renderLook(exact);

    expect(screen.getByRole('link', { name: /Bolsa Baú de Couro Caramelo/ })).toHaveAttribute(
      'href',
      '/product/7',
    );
    expect(screen.getByRole('link', { name: /Calça de sarja verde/ })).toHaveAttribute(
      'href',
      '/product/9',
    );
  });

  it('"+ Adicionar" chama onAdd com o id da peça, sem navegar', async () => {
    const user = userEvent.setup();
    const onAdd = renderLook(exact);

    await user.click(
      screen.getByRole('button', { name: 'Adicionar Calça de sarja verde à sacola' }),
    );

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('9');
  });

  it('peça sem foto mostra o placeholder em vez de imagem quebrada', () => {
    renderLook(exact);

    const semFoto = screen.getAllByRole('listitem')[1];
    expect(within(semFoto).getByRole('img', { name: 'Calça de sarja verde' })).toBeInTheDocument();
    expect(semFoto.querySelector('img')).toBeNull();
  });

  it('a página diz o nome da peça no título; sem título, usa o genérico', () => {
    const { rerender } = render(
      <MemoryRouter>
        <LookSuggestions
          suggestion={exact}
          onAdd={vi.fn()}
          title="Combine esta jaqueta e monte o look"
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Combine esta jaqueta e monte o look' }),
    ).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <LookSuggestions suggestion={exact} onAdd={vi.fn()} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: 'Combine esta peça e monte o look' }),
    ).toBeInTheDocument();
  });

  describe('layout pela largura da seção (não da janela)', () => {
    function renderWithWidth(width: number) {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          disconnect() {}
        },
      );
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width,
      } as DOMRect);
      renderLook(exact);
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('seção estreita (mobile): cartão empilhado, foto grande e botão de largura total', () => {
      renderWithWidth(361);

      const card = screen.getAllByRole('listitem')[0];
      expect(card.className).toContain('flex-col');
      expect(card.querySelector('span')?.className).toContain('w-[143px]');
      expect(within(card).queryByText(/•/)).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Adicionar Bolsa Baú de Couro Caramelo à sacola' })
          .className,
      ).toContain('min-h-11');
    });

    it('seção larga (web): cartão em linha, foto de 55px, preço ao lado da loja e botão compacto', () => {
      renderWithWidth(536);

      const card = screen.getAllByRole('listitem')[0];
      expect(card.className).toContain('flex-row');
      expect(card.querySelector('span')?.className).toContain('w-[55px]');
      expect(within(card).getByText('• +')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Adicionar Bolsa Baú de Couro Caramelo à sacola' })
          .className,
      ).toContain('min-h-9');
    });
  });

  it('usa só classes de token do design system, sem cor ou fonte solta', () => {
    const { container } = render(
      <MemoryRouter>
        <LookSuggestions suggestion={exact} onAdd={vi.fn()} />
      </MemoryRouter>,
    );

    const classes = Array.from(container.querySelectorAll('[class]'))
      .map((element) => element.className)
      .join(' ');
    expect(classes).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(classes).not.toMatch(/text-\[[\d.]+(rem|px)\]/);
  });
});
