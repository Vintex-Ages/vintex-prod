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

  // #438 (FE-FIG-4): trava as classes do layout padrão, que não pode mudar.
  it('sem layout, mantém exatamente as classes da lista e não mostra cartão nem selo', () => {
    renderList(<ChatProductList products={products.slice(0, 3)} title="Peças sugeridas" />);

    expect(screen.getByRole('list').className).toBe('flex gap-3 flex-col');
    expect(screen.getAllByRole('listitem')[0].className).toBe(
      'flex gap-3 border border-linha bg-papel p-3',
    );
    expect(screen.getByRole('heading', { name: 'Peças sugeridas' }).className).toBe(
      'mb-3 text-body font-semibold text-tinta',
    );
    expect(screen.queryByTestId('chat-product-cards')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-product-seal')).not.toBeInTheDocument();
  });

  it('o layout padrão continua sem title na loja e sem mt-auto no link', () => {
    renderList(<ChatProductList products={[products[0]]} />);

    expect(screen.getByText(products[0].store.name)).not.toHaveAttribute('title');
    expect(screen.getByRole('link', { name: 'Ver peça: Vestido floral' })).not.toHaveClass(
      'mt-auto',
    );
  });

  it('layout="list" gera o mesmo HTML de omitir o layout', () => {
    const { container: padrao } = renderList(<ChatProductList products={products} />);
    const htmlPadrao = padrao.innerHTML;
    cleanup();

    const { container: explicito } = renderList(
      <ChatProductList products={products} layout="list" />,
    );

    expect(explicito.innerHTML).toBe(htmlPadrao);
  });

  describe('layout="cards"', () => {
    const tres = products.slice(0, 3);
    const titulo = 'Alternativas próximas';

    it('3 peças viram 3 colunas iguais com nome, preço, loja e link', () => {
      renderList(<ChatProductList products={tres} layout="cards" title={titulo} />);

      const list = screen.getByRole('list');
      const items = within(list).getAllByRole('listitem');
      const prices = [/R\$\s?89,90/, /R\$\s?45,00/, /R\$\s?120,00/];

      expect(list).toHaveClass('grid', 'grid-cols-3');
      expect(list).not.toHaveClass('overflow-x-auto');
      expect(items).toHaveLength(3);

      tres.forEach((product, index) => {
        const item = within(items[index]);

        expect(items[index]).toHaveClass('border', 'border-linha', 'bg-papel-profundo');
        expect(item.getByText(product.name)).toHaveClass(
          'line-clamp-2',
          'text-label',
          'font-semibold',
        );
        expect(item.getByText(prices[index])).toHaveClass('text-label', 'font-bold');
        expect(item.getByText(product.store.name)).toHaveClass('text-label');

        const link = item.getByRole('link', { name: `Ver peça: ${product.name}` });
        expect(link).toHaveTextContent('Ver peça');
        expect(link).toHaveClass('text-label');
        expect(link).toHaveAttribute('href', productDetail(product.id));
      });
    });

    it('imagem em 4:5 e placeholder quando a peça não tem foto', () => {
      const semFoto: Product = { ...products[1], coverImageUrl: null };
      renderList(<ChatProductList products={[products[0], semFoto]} layout="cards" />);

      const foto = screen.getByRole('img', { name: products[0].name });
      expect(foto.tagName).toBe('IMG');
      expect(foto).toHaveClass('object-cover');
      expect(foto.parentElement).toHaveClass('aspect-[4/5]');

      const placeholder = screen.getByRole('img', { name: semFoto.name });
      expect(placeholder.tagName).toBe('DIV');
      expect(placeholder.parentElement).toHaveClass('aspect-[4/5]');
    });

    it('o cartão usa tokens, giro e moldura dourada decorativa', () => {
      renderList(<ChatProductList products={tres} layout="cards" title={titulo} />);

      const cartao = screen.getByTestId('chat-product-cards');
      expect(cartao).toHaveClass('bg-branco-quente', 'border', 'border-linha', 'p-3');
      expect(cartao).toHaveClass('-rotate-[0.45deg]');
      expect(cartao.className).toContain('theme(colors.papel-profundo)');

      const moldura = screen.getByTestId('chat-product-frame');
      expect(moldura).toHaveAttribute('aria-hidden', 'true');
      expect(moldura).toHaveClass(
        'absolute',
        'inset-[5.6px]',
        'border-dourado/55',
        'pointer-events-none',
      );
    });

    it('o título continua sendo heading, agora em display h4', () => {
      renderList(<ChatProductList products={tres} layout="cards" title={titulo} />);

      expect(screen.getByRole('heading', { level: 3, name: titulo })).toHaveClass(
        'font-display',
        'text-h4',
        'tracking-tight',
      );
    });

    it.each([3, 2])('o selo mostra %i (products.length), "achados" e "reais"', (count) => {
      renderList(<ChatProductList products={products.slice(0, count)} layout="cards" />);

      const selo = screen.getByTestId('chat-product-seal');
      expect(within(selo).getByText(String(count))).toBeInTheDocument();
      expect(within(selo).getByText('achados')).toBeInTheDocument();
      expect(within(selo).getByText('reais')).toBeInTheDocument();
      expect(selo).toHaveClass(
        'rotate-[7deg]',
        'rounded-full',
        'border-verde-rs',
        'text-verde-rs',
        'text-label',
        'uppercase',
      );
    });

    it('acima de 3 peças usa rolagem horizontal com colunas de largura fixa', () => {
      renderList(<ChatProductList products={products} layout="cards" />);

      const list = screen.getByRole('list');
      expect(list).toHaveClass('flex', 'flex-nowrap', 'overflow-x-auto');
      expect(list).not.toHaveClass('grid');
      expect(within(list).getAllByRole('listitem')).toHaveLength(4);
      within(list)
        .getAllByRole('listitem')
        .forEach((item) => expect(item).toHaveClass('w-32', 'shrink-0'));
      expect(within(screen.getByTestId('chat-product-seal')).getByText('4')).toBeInTheDocument();
    });

    // jsdom não calcula layout: a folga real do texto no círculo foi medida no Chromium.
    it('o círculo do selo tem 72px e o texto fica visível em text-label', () => {
      renderList(<ChatProductList products={tres} layout="cards" title={titulo} />);

      const selo = screen.getByTestId('chat-product-seal');
      expect(selo).toHaveClass('size-[72px]', 'shrink-0', 'text-label');
      expect(selo).not.toHaveClass('h-[51px]');
      expect(selo).not.toHaveClass('w-[51px]');
      expect(selo).not.toHaveAttribute('aria-hidden');
      ['3', 'achados', 'reais'].forEach((linha) => {
        expect(within(selo).getByText(linha)).toBeVisible();
      });
    });

    it.each([
      [1, ['1', 'achado', 'real']],
      [2, ['2', 'achados', 'reais']],
      [3, ['3', 'achados', 'reais']],
    ])('o selo concorda com %i peça(s)', (count, linhas) => {
      renderList(<ChatProductList products={products.slice(0, count)} layout="cards" />);

      const selo = screen.getByTestId('chat-product-seal');
      expect(Array.from(selo.children).map((linha) => linha.textContent)).toEqual(linhas);
    });

    it.each([
      ['grade', 3],
      ['faixa horizontal', 4],
    ])('na %s, as colunas esticam e o link fica ao pé', (_modo, count) => {
      renderList(<ChatProductList products={products.slice(0, count)} layout="cards" />);

      const list = screen.getByRole('list');
      expect(list).toHaveClass('items-stretch');

      products.slice(0, count).forEach((product) => {
        const nome = screen.getByText(product.name);
        const coluna = nome.closest('li');
        const link = screen.getByRole('link', { name: `Ver peça: ${product.name}` });

        expect(coluna).toHaveClass('flex', 'flex-col');
        expect(link).toHaveClass('mt-auto');

        // Preço e loja logo abaixo do nome, e o link por último.
        const preco = nome.nextElementSibling;
        const loja = preco?.nextElementSibling;
        expect(preco).toHaveTextContent(/R\$/);
        expect(loja).toHaveTextContent(product.store.name);
        expect(loja?.nextElementSibling).toBe(link);
      });
    });

    it('a loja mantém truncate e guarda o nome completo em title', () => {
      renderList(<ChatProductList products={tres} layout="cards" />);

      tres.forEach((product) => {
        const loja = screen.getByText(product.store.name);
        expect(loja).toHaveClass('truncate');
        expect(loja).toHaveAttribute('title', product.store.name);
      });
    });

    it('não renderiza nada sem produtos', () => {
      const { container } = renderList(<ChatProductList products={[]} layout="cards" />);

      expect(container).toBeEmptyDOMElement();
    });

    it('o link chama onOpen igual à lista', async () => {
      const user = userEvent.setup();
      const onOpen = vi.fn();
      renderList(
        <Routes>
          <Route
            path="/"
            element={<ChatProductList products={tres} layout="cards" onOpen={onOpen} />}
          />
          <Route path={productDetail(tres[1].id)} element={<p>Detalhe da camisa</p>} />
        </Routes>,
      );

      await user.click(screen.getByRole('link', { name: 'Ver peça: Camisa de linho' }));

      expect(onOpen).toHaveBeenCalledWith('prod-1');
      expect(screen.getByText('Detalhe da camisa')).toBeInTheDocument();
    });
  });
});
