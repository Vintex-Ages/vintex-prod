import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/context/useAuth';
import { getFeedWithDetails } from '@/services/catalogService';
import { getRecommendations, type Recommendations } from '@/services/recommendationService';
import type { AuthUser } from '@/types/auth';
import type { Paginated, Product, ProductDetail } from '@/types/product';
import Home from './Home';

vi.mock('@/services/catalogService', () => ({ getFeedWithDetails: vi.fn() }));
vi.mock('@/services/recommendationService', () => ({ getRecommendations: vi.fn() }));

const feed: Paginated<ProductDetail> = {
  items: [
    {
      id: '1',
      name: 'Vestido floral',
      price: 89.9,
      coverImageUrl: 'https://example.com/vestido.jpg',
      store: { id: 'loja-1', name: 'Brechó Ana' },
      category: 'Roupas',
      size: 'M',
      color: 'Floral',
      brand: 'Vintage',
      condition: 'Seminovo',
      description: 'Vestido floral em ótimo estado.',
      status: 'ativo',
      media: [{ type: 'image', url: 'https://example.com/vestido.jpg', position: 0 }],
    },
    {
      id: '2',
      name: 'Jaqueta jeans',
      price: 120,
      coverImageUrl: null,
      store: { id: 'loja-2', name: 'Brechó Bia' },
      category: 'Roupas',
      size: 'G',
      color: 'Azul',
      brand: 'Vintage',
      condition: 'Usado',
      description: 'Jaqueta jeans em bom estado.',
      status: 'ativo',
      media: [],
    },
  ],
  page: 1,
  pageSize: 20,
  total: 2,
};

/**
 * Fica no lugar da tela de chat de verdade: mostra a mensagem recebida via
 * `location.state`, confirmando tanto que a navegação aconteceu quanto que
 * ela levou o texto certo, sem precisar mockar `useNavigate` (#207).
 */
function VintexProbe() {
  const location = useLocation();
  const message = (location.state as { message?: string } | null)?.message;
  return <p>Vintex recebeu: {message}</p>;
}

const BUYER: AuthUser = {
  id: 'u_1',
  name: 'Ana',
  email: 'ana@exemplo.com',
  is_seller: false,
  is_admin: false,
};

/** Recomendações (FE-US029-1, #325): itens no formato do feed, sem os detalhes. */
function recommendation(id: string, name: string): Product {
  return {
    id,
    name,
    price: 150,
    coverImageUrl: null,
    store: { id: 'loja-3', name: 'Brechó Cris' },
  };
}

function recommendations(
  items: Product[],
  overrides: Partial<Recommendations> = {},
): Recommendations {
  return { items, personalized: true, page: 1, pageSize: 20, total: items.length, ...overrides };
}

function authValue(user: AuthUser | null): AuthContextValue {
  return {
    user,
    token: user ? 'token' : null,
    isAuthenticated: user !== null,
    loading: false,
    login: () => {},
    logout: () => {},
    refreshUser: async () => {},
  };
}

function homeTree(user: AuthUser | null) {
  return (
    <AuthContext.Provider value={authValue(user)}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/product/1" element={<h1>Detalhe da peça</h1>} />
          <Route path="/vintex" element={<VintexProbe />} />
          <Route path="/sell" element={<h1>Página de vender</h1>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

/** Sem `user`, renderiza a Home anônima. */
function renderHome(user: AuthUser | null = null) {
  return render(homeTree(user));
}

beforeEach(() => {
  vi.mocked(getFeedWithDetails).mockReset();
  // Logado, a grade vem das recomendações; por padrão, os mesmos itens do feed.
  vi.mocked(getRecommendations).mockReset().mockResolvedValue(recommendations(feed.items));
});
afterEach(cleanup);

describe('<Home />', () => {
  it('renderiza os dados do feed e preserva o placeholder para peças sem foto', async () => {
    vi.mocked(getFeedWithDetails).mockResolvedValue(feed);
    renderHome();

    expect(await screen.findByRole('link', { name: 'Vestido floral' })).toBeInTheDocument();
    expect(getFeedWithDetails).toHaveBeenCalledWith();
    expect(screen.getByRole('img', { name: 'Vestido floral' })).toHaveAttribute(
      'src',
      feed.items[0].coverImageUrl,
    );
    expect(screen.getByText(/R\$\s?89,90/)).toBeInTheDocument();
    expect(screen.getAllByText('Roupas')).toHaveLength(3);
    expect(screen.getByText('M · Seminovo')).toBeInTheDocument();
    expect(screen.getByText('Brechó Ana')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Jaqueta jeans' }).tagName).toBe('DIV');
    expect(screen.queryByRole('button', { name: 'Carregar mais achados' })).not.toBeInTheDocument();
  });

  it('filtra a categoria no próprio feed e mantém seu título', async () => {
    const user = userEvent.setup();
    vi.mocked(getFeedWithDetails).mockResolvedValue(feed);
    renderHome();

    await screen.findByRole('link', { name: 'Vestido floral' });
    await user.click(screen.getByRole('button', { name: 'Acessórios' }));

    await waitFor(() => {
      expect(getFeedWithDetails).toHaveBeenLastCalledWith({ category: 'Acessórios' });
    });
    expect(screen.getByRole('heading', { name: 'Feed de achados' })).toBeInTheDocument();
  });

  it('mostra os skeletons existentes durante o carregamento', () => {
    vi.mocked(getFeedWithDetails).mockReturnValue(new Promise(() => {}));
    renderHome();

    // A secao do feed e nomeada pelo proprio titulo (`aria-labelledby`), entao
    // o nome acessivel e o que a pessoa le na tela.
    const region = screen.getByRole('region', { name: 'Feed de achados' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    // O aviso continua existindo para leitor de tela, agora só fora da tela:
    // os skeletons sao aria-hidden, entao sem ele a espera fica muda.
    expect(within(region).getByRole('status')).toHaveTextContent('Carregando peças');
    expect(within(region).getByRole('status')).toHaveClass('sr-only');
    expect(region.querySelectorAll('[aria-hidden="true"]')).toHaveLength(8);
    expect(within(region).queryByRole('link')).not.toBeInTheDocument();
  });

  it('concatena a próxima página e oculta o botão ao alcançar o total', async () => {
    const user = userEvent.setup();
    let resolveNext!: (page: Paginated<ProductDetail>) => void;
    vi.mocked(getFeedWithDetails)
      .mockResolvedValueOnce({ ...feed, total: 3 })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNext = resolve;
        }),
      );
    renderHome();

    await screen.findByRole('link', { name: 'Vestido floral' });
    await user.click(screen.getByRole('button', { name: 'Carregar mais achados' }));
    expect(getFeedWithDetails).toHaveBeenLastCalledWith({ page: 2 });
    // Enquanto busca a proxima pagina o botao troca de rotulo, como o "Criando
    // conta..." do cadastro: desabilitado e mudo nao dizia que algo acontecia.
    expect(screen.getByRole('button', { name: 'Carregando…' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Vestido floral' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jaqueta jeans' })).toBeInTheDocument();

    resolveNext({
      ...feed,
      items: [{ ...feed.items[0], id: '3', name: 'Camisa azul' }],
      page: 2,
      total: 3,
    });
    expect(await screen.findByRole('link', { name: 'Camisa azul' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vestido floral' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jaqueta jeans' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais achados' })).not.toBeInTheDocument();
  });

  it('navega para a rota existente do detalhe ao abrir uma peça', async () => {
    const user = userEvent.setup();
    vi.mocked(getFeedWithDetails).mockResolvedValue(feed);
    renderHome();

    await user.click(await screen.findByRole('link', { name: 'Vestido floral' }));
    expect(screen.getByRole('heading', { name: 'Detalhe da peça' })).toBeInTheDocument();
  });

  // --- #207: pontos de entrada da Vintex ---

  it('mostra o spotlight web com o título semântico da página', async () => {
    vi.mocked(getFeedWithDetails).mockResolvedValue(feed);
    renderHome();

    await screen.findByRole('link', { name: 'Vestido floral' });

    const headings = screen.getAllByRole('heading', {
      name: 'Garimpe a peça certa nos brechós do Rio Grande do Sul.',
      level: 1,
    });
    expect(headings).toHaveLength(1);
  });

  it('enviar pelo spotlight leva para /vintex com a mensagem, não para o catálogo', async () => {
    const user = userEvent.setup();
    vi.mocked(getFeedWithDetails).mockResolvedValue(feed);
    renderHome();

    await screen.findByRole('link', { name: 'Vestido floral' });

    const input = screen.getByPlaceholderText('O que você procura?');
    await user.type(input, 'jaqueta de couro{Enter}');

    expect(await screen.findByText('Vintex recebeu: jaqueta de couro')).toBeInTheDocument();
  });
  describe('convite para vender (FE-US006-1, #212)', () => {
    beforeEach(() => {
      vi.mocked(getFeedWithDetails).mockResolvedValue(feed);
    });

    it('logado sem loja: mostra o convite e ele leva a /sell', async () => {
      const user = userEvent.setup();
      renderHome(BUYER);

      await user.click(await screen.findByRole('link', { name: 'Anunciar Peça' }));

      expect(await screen.findByRole('heading', { name: 'Página de vender' })).toBeInTheDocument();
    });

    it('anônimo não vê o convite', async () => {
      renderHome();

      await screen.findByRole('link', { name: 'Vestido floral' });
      expect(screen.queryByRole('link', { name: 'Anunciar Peça' })).not.toBeInTheDocument();
    });

    it('quem já vende não vê o convite', async () => {
      renderHome({ ...BUYER, is_seller: true });

      await screen.findByRole('link', { name: 'Vestido floral' });
      expect(screen.queryByRole('link', { name: 'Anunciar Peça' })).not.toBeInTheDocument();
    });
  });

  describe('"Garimpados para Você" vem das recomendações (FE-US029-1, #325)', () => {
    // Objetivo declarado (RN-64).
    it('logado e sem categoria usa getRecommendations e mostra os itens dela', async () => {
      vi.mocked(getRecommendations).mockResolvedValue(
        recommendations([
          recommendation('7', 'Blazer de alfaiataria'),
          recommendation('8', 'Camisa social branca'),
        ]),
      );
      renderHome(BUYER);

      const region = screen.getByRole('region', { name: 'Garimpados para Você' });
      expect(
        await within(region).findByRole('link', { name: 'Blazer de alfaiataria' }),
      ).toBeInTheDocument();
      expect(within(region).getByRole('link', { name: 'Camisa social branca' })).toHaveAttribute(
        'href',
        '/product/8',
      );
      expect(getRecommendations).toHaveBeenCalledWith(1);
      expect(getFeedWithDetails).not.toHaveBeenCalled();
    });

    // Objetivo declarado (RN-38): recomendação não vira erro para o usuário.
    it('getRecommendations rejeitando mostra o feed, sem ErrorState', async () => {
      vi.mocked(getRecommendations).mockRejectedValue(new Error('500'));
      vi.mocked(getFeedWithDetails).mockResolvedValue(feed);
      renderHome(BUYER);

      expect(await screen.findByRole('link', { name: 'Vestido floral' })).toBeInTheDocument();
      expect(getFeedWithDetails).toHaveBeenCalledWith();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText('Algo não carregou')).not.toBeInTheDocument();
    });

    it('ErrorState só aparece se recomendações e feed falharem', async () => {
      vi.mocked(getRecommendations).mockRejectedValue(new Error('500'));
      vi.mocked(getFeedWithDetails).mockRejectedValue(new Error('500'));
      renderHome(BUYER);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não foi possível carregar as peças agora.',
      );
    });

    /**
     * Logado, os chips de categoria são links para o catálogo: não há como
     * escolher categoria na Home logada. O caso real em que categoria e
     * sessão se cruzam é a sessão mudar com a Home montada (o `AuthProvider`
     * restaura a sessão depois de os filhos já terem renderizado): a categoria
     * escolhida como anônimo continua valendo, e a fonte é o feed dela.
     */
    it('com categoria escolhida, ao virar logado continua no feed da categoria', async () => {
      const user = userEvent.setup();
      vi.mocked(getFeedWithDetails).mockResolvedValue(feed);
      const { rerender } = renderHome();
      await screen.findByRole('link', { name: 'Vestido floral' });
      await user.click(screen.getByRole('button', { name: 'Acessórios' }));
      await waitFor(() =>
        expect(getFeedWithDetails).toHaveBeenLastCalledWith({ category: 'Acessórios' }),
      );
      const chamadasAntes = vi.mocked(getFeedWithDetails).mock.calls.length;

      rerender(homeTree(BUYER));

      await screen.findByRole('heading', { name: 'Garimpados para Você' });
      await waitFor(() =>
        expect(vi.mocked(getFeedWithDetails).mock.calls.length).toBeGreaterThan(chamadasAntes),
      );
      expect(getFeedWithDetails).toHaveBeenLastCalledWith({ category: 'Acessórios' });
      expect(getRecommendations).not.toHaveBeenCalled();
    });

    it('logado, os chips de categoria levam ao catálogo e não trocam a fonte da grade', async () => {
      renderHome(BUYER);
      await screen.findByRole('link', { name: 'Vestido floral' });

      const categorias = screen.getByRole('navigation', { name: 'Categorias de peças' });
      expect(within(categorias).getByRole('link', { name: 'Roupas' })).toHaveAttribute(
        'href',
        '/catalog?q=Roupas',
      );
      expect(within(categorias).queryByRole('button')).not.toBeInTheDocument();
    });

    // `personalized: false` = o back não tinha preferências e mandou o genérico (RN-38).
    it('personalized: false mostra os itens que vieram, sem aviso nenhum', async () => {
      const itens = [recommendation('7', 'Blazer de alfaiataria')];
      vi.mocked(getRecommendations).mockResolvedValue(recommendations(itens));
      const personalizado = renderHome(BUYER);
      await screen.findByRole('link', { name: 'Blazer de alfaiataria' });
      const textoPersonalizado = personalizado.container.textContent;
      cleanup();

      vi.mocked(getRecommendations).mockResolvedValue(
        recommendations(itens, { personalized: false }),
      );
      const generico = renderHome(BUYER);
      await screen.findByRole('link', { name: 'Blazer de alfaiataria' });

      expect(getFeedWithDetails).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      // A tela é a mesma, palavra por palavra: nenhum aviso de "genérico".
      expect(generico.container.textContent).toBe(textoPersonalizado);
    });

    it('"Carregar mais" no modo recomendação pede getRecommendations(2) e concatena', async () => {
      const user = userEvent.setup();
      vi.mocked(getRecommendations)
        .mockResolvedValueOnce(
          recommendations([recommendation('7', 'Blazer de alfaiataria')], { total: 2 }),
        )
        .mockResolvedValueOnce(
          recommendations([recommendation('8', 'Camisa social branca')], { page: 2, total: 2 }),
        );
      renderHome(BUYER);

      await user.click(await screen.findByRole('button', { name: 'Carregar mais achados' }));

      expect(await screen.findByRole('link', { name: 'Camisa social branca' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Blazer de alfaiataria' })).toBeInTheDocument();
      expect(getRecommendations).toHaveBeenLastCalledWith(2);
      expect(getFeedWithDetails).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('button', { name: 'Carregar mais achados' }),
      ).not.toBeInTheDocument();
    });

    it('não mostra o selo "98% seu estilo"', async () => {
      renderHome(BUYER);
      await screen.findByRole('link', { name: 'Vestido floral' });

      expect(screen.queryByText(/seu estilo/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/98%/)).not.toBeInTheDocument();
    });
  });
});
