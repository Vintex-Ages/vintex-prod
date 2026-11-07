import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement } from 'react';
import { productDetail } from '@/routes/paths';
import type { Product } from '@/types/product';
import { ChatProductList } from './ChatProductList';

afterEach(cleanup);

const products: Product[] = [
  {
    id: 'prod-3',
    name: 'Vestido floral',
    price: 89.9,
    coverImageUrl: 'https://example.com/vestido.jpg',
    store: { id: 'store-1', name: 'Brechó Ana' },
  },
  {
    id: 'prod-1',
    name: 'Camisa de linho',
    price: 45,
    coverImageUrl: 'https://example.com/camisa.jpg',
    store: { id: 'store-2', name: 'Segunda Chance' },
  },
  {
    id: 'prod-4',
    name: 'Calça jeans',
    price: 120,
    coverImageUrl: 'https://example.com/calca.jpg',
    store: { id: 'store-3', name: 'Garimpo do Sul' },
  },
  {
    id: 'prod-2',
    name: 'Bolsa de couro',
    price: 175.5,
    coverImageUrl: 'https://example.com/bolsa.jpg',
    store: { id: 'store-4', name: 'Acervo Circular' },
  },
];

const renderList = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('<ChatProductList />', () => {
  it.each([undefined, 'Peças sugeridas'])(
    'não renderiza nada sem produtos (title: %s)',
    (title) => {
      const { container } = renderList(<ChatProductList products={[]} title={title} />);

      expect(container).toBeEmptyDOMElement();
    },
  );

  it('renderiza todos os produtos na ordem recebida, com seus campos e links reais', () => {
    renderList(<ChatProductList products={products} />);

    const items = screen.getAllByRole('listitem');
    const prices = [/R\$\s?89,90/, /R\$\s?45,00/, /R\$\s?120,00/, /R\$\s?175,50/];

    expect(items).toHaveLength(products.length);
    expect(screen.getAllByRole('link')).toHaveLength(products.length);

    products.forEach((product, index) => {
      const item = within(items[index]);

      expect(item.getByText(product.name)).toBeInTheDocument();
      expect(item.getByText(prices[index])).toBeInTheDocument();
      expect(item.getByText(product.store.name)).toBeInTheDocument();
      expect(item.getByRole('img', { name: product.name })).toHaveAttribute(
        'src',
        product.coverImageUrl,
      );

      const link = item.getByRole('link', { name: `Ver peça: ${product.name}` });
      expect(link).toHaveTextContent('Ver peça');
      expect(link).toHaveAttribute('href', productDetail(product.id));
    });
  });

  it('mostra o placeholder acessível quando o produto não tem foto', () => {
    const productWithoutImage: Product = { ...products[0], coverImageUrl: null };
    renderList(<ChatProductList products={[productWithoutImage]} />);

    const placeholder = screen.getByRole('img', { name: productWithoutImage.name });

    expect(placeholder.tagName).toBe('DIV');
    expect(placeholder.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByAltText(productWithoutImage.name)).not.toBeInTheDocument();
  });

  it('renderiza o título quando fornecido', () => {
    renderList(<ChatProductList products={products} title="Peças sugeridas" />);

    expect(screen.getByText('Peças sugeridas')).toBeInTheDocument();
  });

  it('não renderiza título quando a prop é omitida', () => {
    renderList(<ChatProductList products={[products[0]]} />);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  // jsdom não calcula layout; as classes verificam a configuração dos dois modos.
  it.each([1, 2, 3])('usa coluna compacta para %i produtos', (count) => {
    renderList(<ChatProductList products={products.slice(0, count)} />);

    expect(screen.getByRole('list')).toHaveClass('flex', 'flex-col');
    expect(screen.getByRole('list')).not.toHaveClass('overflow-x-auto');
    expect(screen.getAllByRole('listitem')).toHaveLength(count);
  });

  it('usa faixa horizontal com scroll e itens sem encolher a partir de quatro produtos', () => {
    renderList(<ChatProductList products={products} />);

    expect(screen.getByRole('list')).toHaveClass('flex', 'flex-nowrap', 'overflow-x-auto');
    expect(screen.getByRole('list')).not.toHaveClass('flex-col');
    screen.getAllByRole('listitem').forEach((item) => {
      expect(item).toHaveClass('shrink-0');
    });
  });

  it('chama onOpen com o id do produto em um clique primário', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderList(
      <Routes>
        <Route path="/" element={<ChatProductList products={products} onOpen={onOpen} />} />
        <Route path={productDetail(products[1].id)} element={<p>Detalhe da camisa</p>} />
      </Routes>,
    );

    await user.click(screen.getByRole('link', { name: 'Ver peça: Camisa de linho' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('prod-1');
    expect(screen.getByText('Detalhe da camisa')).toBeInTheDocument();
  });

  it('chama onOpen ao ativar o link com Enter', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderList(
      <Routes>
        <Route path="/" element={<ChatProductList products={[products[0]]} onOpen={onOpen} />} />
        <Route path={productDetail(products[0].id)} element={<p>Detalhe do vestido</p>} />
      </Routes>,
    );

    await user.tab();
    expect(screen.getByRole('link', { name: 'Ver peça: Vestido floral' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('prod-3');
    expect(screen.getByText('Detalhe do vestido')).toBeInTheDocument();
  });

  it('navega para o detalhe sem depender de onOpen', async () => {
    const user = userEvent.setup();
    renderList(
      <Routes>
        <Route path="/" element={<ChatProductList products={[products[0]]} />} />
        <Route path={productDetail(products[0].id)} element={<p>Detalhe da peça</p>} />
      </Routes>,
    );

    await user.click(screen.getByRole('link', { name: 'Ver peça: Vestido floral' }));

    expect(screen.getByText('Detalhe da peça')).toBeInTheDocument();
  });

  it.each([
    { label: 'Ctrl', type: 'click', options: { ctrlKey: true } },
    { label: 'Cmd', type: 'click', options: { metaKey: true } },
    { label: 'Shift', type: 'click', options: { shiftKey: true } },
    { label: 'Alt', type: 'click', options: { altKey: true } },
    { label: 'botão do meio', type: 'click', options: { button: 1 } },
    { label: 'botão secundário', type: 'click', options: { button: 2 } },
    { label: 'evento auxiliar', type: 'auxclick', options: { button: 1 } },
  ])('preserva a ação nativa com $label e não chama onOpen', ({ type, options }) => {
    const onOpen = vi.fn();
    renderList(<ChatProductList products={[products[0]]} onOpen={onOpen} />);
    const link = screen.getByRole('link', { name: 'Ver peça: Vestido floral' });
    let preventedByComponent: boolean | undefined;

    const observeDefault = (event: Event) => {
      preventedByComponent = event.defaultPrevented;
      // Observa após o handler React; só o teste cancela a navegação que jsdom não implementa.
      event.preventDefault();
    };
    document.addEventListener(type, observeDefault);

    try {
      fireEvent(link, new MouseEvent(type, { bubbles: true, cancelable: true, ...options }));

      expect(preventedByComponent).toBe(false);
      expect(onOpen).not.toHaveBeenCalled();
      expect(link).toHaveAttribute('href', productDetail(products[0].id));
    } finally {
      document.removeEventListener(type, observeDefault);
    }
  });
});
