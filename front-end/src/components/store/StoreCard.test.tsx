import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoreCard from './StoreCard';
import type { StoreSummary } from '@/types/store';
import type { Product } from '@/types/product';

const store: StoreSummary = {
  id: '7',
  name: 'Brechó Aurora',
  logoUrl: null,
  city: 'Porto Alegre',
  state: 'RS',
  verified: true,
  activeCount: 12,
};

const owner = { id: '7', name: 'Brechó Aurora' };

const preview: Product[] = [
  { id: '1', name: 'Jaqueta jeans', price: 120, coverImageUrl: null, store: owner },
  { id: '2', name: 'Vestido floral', price: 90, coverImageUrl: null, store: owner },
];

function setup(props: Partial<React.ComponentProps<typeof StoreCard>> = {}) {
  const onOpen = vi.fn();
  render(<StoreCard store={store} onOpen={onOpen} {...props} />);
  return { onOpen };
}

describe('StoreCard', () => {
  it('mostra nome, cidade/UF e quantidade de peças ativas', () => {
    setup();
    expect(screen.getByText('Brechó Aurora')).toBeInTheDocument();
    expect(screen.getByText(/Porto Alegre.*RS/)).toBeInTheDocument();
    expect(screen.getByText('12 peças ativas')).toBeInTheDocument();
  });

  it('usa o singular com uma peça ativa', () => {
    setup({ store: { ...store, activeCount: 1 } });
    expect(screen.getByText('1 peça ativa')).toBeInTheDocument();
  });

  it('loja verificada mostra o selo Confiável', () => {
    setup();
    expect(screen.getByRole('img', { name: 'Confiável' })).toBeInTheDocument();
  });

  it('loja não verificada não mostra o selo', () => {
    setup({ store: { ...store, verified: false } });
    expect(screen.queryByRole('img', { name: 'Confiável' })).not.toBeInTheDocument();
  });

  it('sem logo, mostra o fallback do Avatar com as iniciais', () => {
    setup();
    expect(screen.getByText('BA')).toBeInTheDocument();
  });

  it('com logo, mostra a imagem da loja', () => {
    setup({ store: { ...store, logoUrl: 'https://x.test/logo.png' } });
    expect(screen.getByRole('img', { name: 'Brechó Aurora' })).toHaveAttribute(
      'src',
      'https://x.test/logo.png',
    );
  });

  it('o clique no cartão chama onOpen com o id da loja', () => {
    const { onOpen } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Brechó Aurora/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('7');
  });

  it('mostra "Ver +N peças" com as peças que não couberam na prévia', () => {
    setup({ preview });
    expect(screen.getByText('Ver +10 peças')).toBeInTheDocument();
  });

  it('usa o singular em "Ver +1 peça"', () => {
    setup({ store: { ...store, activeCount: 3 }, preview });
    expect(screen.getByText('Ver +1 peça')).toBeInTheDocument();
  });

  it('esconde "Ver +N peças" quando a prévia já mostra todas', () => {
    setup({ store: { ...store, activeCount: 2 }, preview });
    expect(screen.queryByText(/Ver \+/)).not.toBeInTheDocument();
  });

  it('não mostra "Ver +N peças" sem prévia', () => {
    setup();
    expect(screen.queryByText(/Ver \+/)).not.toBeInTheDocument();
  });

  it('mostra no máximo 2 peças na prévia, com o preço', () => {
    const withCover = [
      { ...preview[0], coverImageUrl: 'https://x.test/1.jpg' },
      { ...preview[1], coverImageUrl: 'https://x.test/2.jpg' },
      { id: '3', name: 'Bolsa', price: 60.5, coverImageUrl: 'https://x.test/3.jpg', store: owner },
    ];
    setup({ preview: withCover });

    expect(screen.getByAltText('Jaqueta jeans')).toBeInTheDocument();
    expect(screen.getByAltText('Vestido floral')).toBeInTheDocument();
    expect(screen.queryByAltText('Bolsa')).not.toBeInTheDocument();
    expect(screen.getByText(/120/)).toBeInTheDocument();
  });

  it('o "Ver +N peças" também é do cartão: o clique chama onOpen', () => {
    const { onOpen } = setup({ preview });
    fireEvent.click(screen.getByText('Ver +10 peças'));
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Brechó Aurora/ }));
    expect(onOpen).toHaveBeenCalledWith('7');
  });

  it('preenche as colunas que sobram quando não há "Ver +N peças"', () => {
    setup({ store: { ...store, activeCount: 2 }, preview });
    expect(screen.getAllByTestId('store-card-empty-cell')).toHaveLength(1);
  });

  it('com uma peça só, sobram duas células vazias', () => {
    setup({ store: { ...store, activeCount: 1 }, preview: [preview[0]] });
    expect(screen.getAllByTestId('store-card-empty-cell')).toHaveLength(2);
  });

  it('com "Ver +N peças" e duas peças, não sobra célula vazia', () => {
    setup({ preview });
    expect(screen.queryAllByTestId('store-card-empty-cell')).toHaveLength(0);
  });

  it('sem prévia, não monta a grade', () => {
    setup();
    expect(screen.queryAllByTestId('store-card-empty-cell')).toHaveLength(0);
  });
});
